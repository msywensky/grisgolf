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
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field, model_validator

from ..ai import extract_scorecard
from ..config import get_settings
from ..db import get_db
from ..ratelimit import rate_limit

router = APIRouter(prefix="/api/courses", tags=["courses"])

GOLF_API_BASE = "https://api.golfcourseapi.com"
API_TIMEOUT = 6.0
CACHE_MAX_AGE = timedelta(days=90)
MAX_RESULTS = 12

# Scorecard imports: never refetched from GolfCourseAPI (there's nothing to
# refetch — the row *is* the source of truth).
CUSTOM_ID_PREFIX = "custom:"

# ~5.4MB photo before base64 inflates it by 4/3 — plenty for a scorecard.
MAX_IMAGE_B64_CHARS = 8_000_000

SCORECARD_BUCKET = "scorecard"
SCORECARD_BUDGET = 5  # scans + imports per hour per IP, combined

# Recent external search results keyed by GolfCourseAPI id (newest last).
_recent: OrderedDict[int, dict] = OrderedDict()
_RECENT_CAP = 200


def _remember(course: dict) -> None:
    external_id = course.get("id")
    if not isinstance(external_id, str) or not external_id:
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
    external_id: str
    club_name: str
    course_name: str
    city: str = ""
    state: str = ""
    tees: dict = {}


class SearchResponse(BaseModel):
    results: list[CourseSummary]
    degraded: bool = False


def _summary(external_id: str, club: str, course: str, city: Any, state: Any, tees: Any) -> CourseSummary:
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
    seen: set[str] = set()

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
                if not isinstance(course.get("id"), str) or course["id"] in seen:
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


def _fetch_course(external_id: str) -> Optional[dict]:
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


def ensure_cached(external_id: str) -> dict:
    """Return the `courses` row for an external id, fetching/upserting if needed.

    A stale cached row beats a failed refresh; only no-row-at-all is an error.
    """
    db = get_db()
    res = db.table("courses").select("*").eq("external_id", external_id).maybe_single().execute()
    row = res.data if res else None
    if row and external_id.startswith(CUSTOM_ID_PREFIX):
        return row
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


# ---------- Scorecard import ----------
#
# Two endpoints, one paid: /scan reads the photo and returns nothing but the
# extracted data (no DB write); /import persists the user-corrected result.
# Both are unauthenticated and public (same trust posture as /search), so both
# share one IP rate-limit bucket. Accepted risk: /import is a write to a
# publicly-readable table — the rate limit + strict validation below is the
# agreed mitigation; a scan-token handshake is the deferred next step if abuse
# shows up in practice.


class ScanRequest(BaseModel):
    image_base64: str
    media_type: str = "image/jpeg"


class ScanHole(BaseModel):
    number: int
    par: int
    handicap: Optional[int] = None


class ScanResponse(BaseModel):
    club_name: str
    holes: list[ScanHole]


@router.post("/scan")
def scan_scorecard(body: ScanRequest, request: Request) -> ScanResponse:
    """Read pars + stroke index off a scorecard photo. No DB write — the
    result is reviewed and corrected by the user before /import persists it."""
    rate_limit(request, budget=SCORECARD_BUDGET, bucket=SCORECARD_BUCKET)
    if len(body.image_base64) > MAX_IMAGE_B64_CHARS:
        raise HTTPException(
            status_code=413,
            detail="That photo's too big — try a tighter crop of just the scorecard. 🍺",
        )

    extracted = extract_scorecard(body.image_base64, body.media_type)
    count = len(extracted.holes)
    if count not in (9, 18):
        raise HTTPException(
            status_code=422,
            detail=f"Found {count} holes, but scorecards need 9 or 18 — try cropping to just the holes row. 🍺",
        )

    # Hide wrong-looking values rather than show them as fact — the review
    # screen flags a 0 par / blank handicap for the organizer to fill in.
    holes = [
        ScanHole(
            number=h.number,
            par=h.par if 3 <= h.par <= 6 else 0,
            handicap=h.handicap if h.handicap is not None and 1 <= h.handicap <= count else None,
        )
        for h in extracted.holes
    ]
    return ScanResponse(club_name=extracted.club_name, holes=holes)


class ImportHole(BaseModel):
    par: int = Field(ge=3, le=6)
    handicap: Optional[int] = None


class ImportCourse(BaseModel):
    club_name: str = Field(min_length=1, max_length=120)
    course_name: str = Field(default="", max_length=120)
    address: str = Field(default="", max_length=200)
    city: str = Field(default="", max_length=80)
    state: str = Field(min_length=2, max_length=2)
    holes: list[ImportHole]

    @model_validator(mode="after")
    def _check_holes(self) -> "ImportCourse":
        count = len(self.holes)
        if count not in (9, 18):
            raise ValueError("Need 9 or 18 holes.")
        if any(h.handicap is not None and not (1 <= h.handicap <= count) for h in self.holes):
            raise ValueError("Handicap must be between 1 and the number of holes.")
        return self


@router.post("/import")
def import_course(body: ImportCourse, request: Request) -> CourseSummary:
    """Persist a scorecard-derived course as an ordinary `courses` row, so it
    behaves identically to a GolfCourseAPI course everywhere downstream."""
    rate_limit(request, budget=SCORECARD_BUDGET, bucket=SCORECARD_BUCKET)
    state = body.state.upper()

    tee = {
        "tee_name": "Scorecard",
        "course_rating": 0,
        "slope_rating": 0,
        "total_yards": 0,
        "par_total": sum(h.par for h in body.holes),
        "number_of_holes": len(body.holes),
        "holes": [{"par": h.par, "yardage": 0, "handicap": h.handicap} for h in body.holes],
    }

    row = (
        get_db()
        .table("courses")
        .insert(
            {
                "external_id": f"{CUSTOM_ID_PREFIX}{uuid4()}",
                "club_name": body.club_name,
                "course_name": body.course_name or body.club_name,
                "address": body.address or None,
                "city": body.city or None,
                "state": state,
                "country": "United States",
                "tees": {"male": [tee]},
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .execute()
        .data[0]
    )
    return _summary(
        row["external_id"], row["club_name"], row["course_name"], row.get("city"), row.get("state"), row.get("tees")
    )
