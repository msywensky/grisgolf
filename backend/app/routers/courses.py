"""Real-course search proxy + cache for GolfCourseAPI.

The API key is a server secret and the free tier is ~50 requests/day, so the
frontend never talks to GolfCourseAPI directly. Two cache layers keep the
budget intact: courses an organizer actually selects are stored durably in
the `courses` table (service-role writes only — anon has read-only RLS), and
recent search results are held in a small in-process LRU so selecting a course
right after searching costs zero extra external calls.
"""

import re
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..config import get_settings
from ..db import get_db

router = APIRouter(prefix="/api/courses", tags=["courses"])

GOLF_API_BASE = "https://api.golfcourseapi.com"
API_TIMEOUT = 6.0
CACHE_MAX_AGE = timedelta(days=90)
MAX_RESULTS = 12

# Recent external search results keyed by GolfCourseAPI id (newest last).
_recent: OrderedDict[int, dict] = OrderedDict()
_RECENT_CAP = 200


def _remember(course: dict) -> None:
    external_id = course.get("id")
    if not isinstance(external_id, int):
        return
    _recent.pop(external_id, None)
    _recent[external_id] = course
    while len(_recent) > _RECENT_CAP:
        _recent.popitem(last=False)


def _auth_headers() -> dict:
    return {"Authorization": f"Bearer {get_settings().golf_api_key}"}


def display_name(row: dict) -> str:
    """One display string per course: 'Club' or 'Club — Course No. 2'."""
    club = (row.get("club_name") or "").strip()
    course = (row.get("course_name") or "").strip()
    if not course or course.lower() == club.lower():
        return club or course
    return f"{club} — {course}"


class CourseSummary(BaseModel):
    external_id: int
    club_name: str
    course_name: str
    city: str = ""
    state: str = ""
    tees: dict = {}


class SearchResponse(BaseModel):
    results: list[CourseSummary]
    degraded: bool = False


def _summary(external_id: int, club: str, course: str, city: Any, state: Any, tees: Any) -> CourseSummary:
    return CourseSummary(
        external_id=external_id,
        club_name=club or "",
        course_name=course or club or "",
        city=city or "",
        state=state or "",
        tees=tees if isinstance(tees, dict) else {},
    )


@router.get("/search")
def search_courses(
    q: str = Query(min_length=3, max_length=80),
    state: str = Query(min_length=2, max_length=2),
) -> SearchResponse:
    state = state.upper()
    results: list[CourseSummary] = []
    seen: set[int] = set()

    # 1) Our own cache — free, and where the crew's usual courses end up.
    # PostgREST or= syntax breaks on commas/parens, so strip them from the term.
    safe_q = re.sub(r'[,()\\%"]', " ", q).strip()
    if safe_q:
        try:
            cached = (
                get_db()
                .table("courses")
                .select("*")
                .eq("state", state)
                .or_(f"club_name.ilike.%{safe_q}%,course_name.ilike.%{safe_q}%")
                .limit(MAX_RESULTS)
                .execute()
                .data
                or []
            )
        except Exception:
            # Cache is best-effort (e.g. table not migrated yet) — external
            # search below can still answer.
            cached = []
        for row in cached:
            seen.add(row["external_id"])
            results.append(
                _summary(row["external_id"], row["club_name"], row["course_name"],
                         row.get("city"), row.get("state"), row.get("tees"))
            )

    # 2) External search (name-only matching — the state filter is ours).
    degraded = False
    if get_settings().golf_api_key:
        try:
            resp = httpx.get(
                f"{GOLF_API_BASE}/v1/search",
                params={"search_query": q},
                headers=_auth_headers(),
                timeout=API_TIMEOUT,
            )
            resp.raise_for_status()
            for course in resp.json().get("courses") or []:
                loc = course.get("location") or {}
                if loc.get("country") != "United States" or loc.get("state") != state:
                    continue
                _remember(course)
                if not isinstance(course.get("id"), int) or course["id"] in seen:
                    continue
                results.append(
                    _summary(course["id"], course.get("club_name", ""), course.get("course_name", ""),
                             loc.get("city"), loc.get("state"), course.get("tees"))
                )
        except httpx.HTTPError:
            degraded = True
    else:
        degraded = True

    return SearchResponse(results=results[:MAX_RESULTS], degraded=degraded)


def _parse_ts(value: str) -> Optional[datetime]:
    try:
        ts = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _fetch_course(external_id: int) -> Optional[dict]:
    """Full course payload: recent-search LRU first, external API second."""
    course = _recent.get(external_id)
    if course is not None:
        return course
    if not get_settings().golf_api_key:
        return None
    try:
        resp = httpx.get(
            f"{GOLF_API_BASE}/v1/courses/{external_id}",
            headers=_auth_headers(),
            timeout=API_TIMEOUT,
        )
        resp.raise_for_status()
        payload = resp.json()
        # Tolerate both a bare Course and a {"course": {...}} envelope.
        return payload.get("course", payload) if isinstance(payload, dict) else None
    except httpx.HTTPError:
        return None


def ensure_cached(external_id: int) -> dict:
    """Return the `courses` row for an external id, fetching/upserting if needed.

    A stale cached row beats a failed refresh; only no-row-at-all is an error.
    """
    db = get_db()
    res = db.table("courses").select("*").eq("external_id", external_id).maybe_single().execute()
    row = res.data if res else None
    if row:
        fetched_at = _parse_ts(row.get("fetched_at") or "")
        if fetched_at and datetime.now(timezone.utc) - fetched_at < CACHE_MAX_AGE:
            return row

    course = _fetch_course(external_id)
    if course is None:
        if row:
            return row
        raise HTTPException(
            status_code=502,
            detail="Couldn't reach the course database — try again, or save the course as a plain name. 🍺",
        )

    loc = course.get("location") or {}
    return (
        db.table("courses")
        .upsert(
            {
                "external_id": external_id,
                "club_name": course.get("club_name") or "",
                "course_name": course.get("course_name") or course.get("club_name") or "",
                "address": loc.get("address"),
                "city": loc.get("city"),
                "state": loc.get("state"),
                "country": loc.get("country"),
                "latitude": loc.get("latitude"),
                "longitude": loc.get("longitude"),
                "tees": course.get("tees") or {},
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="external_id",
        )
        .execute()
        .data[0]
    )
