"""League lifecycle: create, join, seasons, fixed teams, league nights, ICS.

Everything here is JWT-verified (see auth.require_user) and runs on the
service-role client, so each route validates its own input — RLS is not the
safety net on this lane.
"""

import secrets
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_db
from ..ics import build_league_ics
from .courses import display_name, ensure_cached
from .events import CODE_ALPHABET, _new_pin

router = APIRouter(prefix="/api/leagues", tags=["leagues"])


def _new_share_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def _get_league(share_code: str) -> dict:
    res = (
        get_db()
        .table("leagues")
        .select("*")
        .eq("share_code", share_code)
        .maybe_single()
        .execute()
    )
    if not res or not res.data:
        raise HTTPException(status_code=404, detail="League not found. Wrong link?")
    return res.data


def _require_manager(share_code: str, user_id: str) -> dict:
    """Return the league if the user manages it, else 403."""
    league = _get_league(share_code)
    res = (
        get_db()
        .table("league_managers")
        .select("user_id")
        .eq("league_id", league["id"])
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not res or not res.data:
        raise HTTPException(status_code=403, detail="Managers only. Nice try, sandbagger.")
    return league


def _upsert_profile(user_id: str, display_name_: Optional[str], handicap: Optional[float]) -> None:
    """Create/update the caller's profile. No-op when nothing was sent."""
    profile: dict = {"id": user_id}
    if display_name_:
        profile["display_name"] = display_name_
    if handicap is not None:
        profile["handicap"] = handicap
    db = get_db()
    existing = db.table("profiles").select("id").eq("id", user_id).maybe_single().execute()
    if existing and existing.data:
        patch = {k: v for k, v in profile.items() if k != "id"}
        if "handicap" in patch:
            patch["default_handicap"] = patch.pop("handicap")
        if patch:
            db.table("profiles").update(patch).eq("id", user_id).execute()
    else:
        if "display_name" not in profile:
            raise HTTPException(status_code=422, detail="Tell us your name first.")
        db.table("profiles").insert(
            {
                "id": user_id,
                "display_name": profile["display_name"],
                "default_handicap": profile.get("handicap", 0),
            }
        ).execute()


# ---------- Create / update / join ----------


class CreateLeague(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scoring_mode: Literal["placement", "match_points", "record"] = "placement"
    placement_points: Optional[list[float]] = Field(default=None, min_length=1, max_length=20)
    # The creator's profile (they become manager + first member)
    display_name: str = Field(min_length=1, max_length=60)
    handicap: Optional[float] = Field(default=None, ge=0, le=54)


@router.post("")
def create_league(body: CreateLeague, user_id: str = Depends(require_user)) -> dict:
    db = get_db()
    _upsert_profile(user_id, body.display_name, body.handicap)
    share_code = _new_share_code()
    insert = {
        "name": body.name,
        "share_code": share_code,
        "scoring_mode": body.scoring_mode,
    }
    if body.placement_points is not None:
        insert["placement_points"] = body.placement_points
    league = db.table("leagues").insert(insert).execute().data[0]
    db.table("league_managers").insert({"league_id": league["id"], "user_id": user_id}).execute()
    db.table("league_members").insert({"league_id": league["id"], "user_id": user_id}).execute()
    return {"share_code": share_code}


class UpdateLeague(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    scoring_mode: Optional[Literal["placement", "match_points", "record"]] = None
    placement_points: Optional[list[float]] = Field(default=None, min_length=1, max_length=20)


@router.patch("/{share_code}")
def update_league(
    share_code: str, body: UpdateLeague, user_id: str = Depends(require_user)
) -> dict:
    league = _require_manager(share_code, user_id)
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if patch:
        get_db().table("leagues").update(patch).eq("id", league["id"]).execute()
    return {"ok": True}


class JoinLeague(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    handicap: Optional[float] = Field(default=None, ge=0, le=54)


@router.post("/{share_code}/join")
def join_league(share_code: str, body: JoinLeague, user_id: str = Depends(require_user)) -> dict:
    league = _get_league(share_code)
    _upsert_profile(user_id, body.display_name, body.handicap)
    get_db().table("league_members").upsert(
        {"league_id": league["id"], "user_id": user_id},
        on_conflict="league_id,user_id",
        ignore_duplicates=True,
    ).execute()
    return {"ok": True}


# ---------- Seasons + fixed teams ----------


class CreateSeason(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None


@router.post("/{share_code}/seasons")
def create_season(
    share_code: str, body: CreateSeason, user_id: str = Depends(require_user)
) -> dict:
    league = _require_manager(share_code, user_id)
    season = (
        get_db()
        .table("seasons")
        .insert(
            {
                "league_id": league["id"],
                "name": body.name,
                "starts_on": body.starts_on.isoformat() if body.starts_on else None,
                "ends_on": body.ends_on.isoformat() if body.ends_on else None,
            }
        )
        .execute()
        .data[0]
    )
    return season


class UpdateSeason(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    status: Optional[Literal["active", "complete"]] = None


@router.patch("/{share_code}/seasons/{season_id}")
def update_season(
    share_code: str, season_id: str, body: UpdateSeason, user_id: str = Depends(require_user)
) -> dict:
    league = _require_manager(share_code, user_id)
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if patch:
        res = (
            get_db()
            .table("seasons")
            .update(patch)
            .eq("id", season_id)
            .eq("league_id", league["id"])
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Season not found in this league.")
    return {"ok": True}


class SeasonTeamInput(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    player1_user_id: Optional[str] = None
    player2_user_id: Optional[str] = None


class SetSeasonTeams(BaseModel):
    teams: list[SeasonTeamInput] = Field(max_length=50)


@router.put("/{share_code}/seasons/{season_id}/teams")
def set_season_teams(
    share_code: str, season_id: str, body: SetSeasonTeams, user_id: str = Depends(require_user)
) -> dict:
    """Replace the season's fixed pairs. Players must be on the league roster."""
    db = get_db()
    league = _require_manager(share_code, user_id)
    season = (
        db.table("seasons")
        .select("id")
        .eq("id", season_id)
        .eq("league_id", league["id"])
        .maybe_single()
        .execute()
    )
    if not season or not season.data:
        raise HTTPException(status_code=404, detail="Season not found in this league.")

    members = {
        row["user_id"]
        for row in db.table("league_members")
        .select("user_id")
        .eq("league_id", league["id"])
        .execute()
        .data
    }
    for team in body.teams:
        for pid in (team.player1_user_id, team.player2_user_id):
            if pid is not None and pid not in members:
                raise HTTPException(
                    status_code=422, detail=f"'{team.name}' includes someone not on the roster."
                )

    db.table("season_teams").delete().eq("season_id", season_id).execute()
    if body.teams:
        db.table("season_teams").insert(
            [
                {
                    "season_id": season_id,
                    "name": t.name,
                    "player1_user_id": t.player1_user_id,
                    "player2_user_id": t.player2_user_id,
                }
                for t in body.teams
            ]
        ).execute()
    return {"ok": True}


# ---------- League nights ----------


class CreateLeagueEvent(BaseModel):
    season_id: str
    title: str = Field(min_length=1, max_length=100)
    course: str = Field(min_length=1, max_length=100)
    date: date
    holes: Literal[9, 18] = 18
    admin_pin: Optional[str] = Field(default=None, min_length=4, max_length=4)
    external_course_id: Optional[str] = None
    tee_name: Optional[str] = Field(default=None, max_length=60)
    tee_gender: Optional[Literal["male", "female"]] = None


@router.post("/{share_code}/events")
def create_league_event(
    share_code: str, body: CreateLeagueEvent, user_id: str = Depends(require_user)
) -> dict:
    """Schedule a league night: an ordinary event pre-loaded with the season's
    fixed teams, so the existing scoring pages just work."""
    db = get_db()
    league = _require_manager(share_code, user_id)
    season = (
        db.table("seasons")
        .select("id")
        .eq("id", body.season_id)
        .eq("league_id", league["id"])
        .maybe_single()
        .execute()
    )
    if not season or not season.data:
        raise HTTPException(status_code=404, detail="Season not found in this league.")

    manager = db.table("profiles").select("display_name").eq("id", user_id).single().execute()
    event_code = _new_share_code()
    pin = body.admin_pin or _new_pin()

    insert = {
        "title": body.title,
        "course": body.course,
        "date": body.date.isoformat(),
        "holes": body.holes,
        "status": "upcoming",
        "created_by": manager.data["display_name"],
        "share_code": event_code,
        "league_id": league["id"],
        "season_id": body.season_id,
    }
    if body.external_course_id is not None:
        course_row = ensure_cached(body.external_course_id)
        insert["course_id"] = course_row["id"]
        insert["course"] = display_name(course_row) or body.course
        insert["tee_name"] = body.tee_name
        insert["tee_gender"] = body.tee_gender

    event = db.table("events").insert(insert).execute().data[0]
    db.table("event_admins").insert({"event_id": event["id"], "pin": pin}).execute()

    # Pre-populate golfers + teams from the season's fixed pairs (handicap
    # snapshot from profiles — mid-season profile edits don't rewrite history).
    season_teams = (
        db.table("season_teams").select("*").eq("season_id", body.season_id).order("created_at").execute().data
    )
    player_ids = {
        pid
        for t in season_teams
        for pid in (t["player1_user_id"], t["player2_user_id"])
        if pid is not None
    }
    profiles = (
        db.table("profiles").select("*").in_("id", list(player_ids)).execute().data
        if player_ids
        else []
    )
    profile_by_id = {p["id"]: p for p in profiles}

    golfer_ids: dict[str, str] = {}  # user_id -> new golfer id
    for pid in player_ids:
        profile = profile_by_id.get(pid)
        if not profile:
            continue
        golfer = (
            db.table("golfers")
            .insert(
                {
                    "name": profile["display_name"],
                    "handicap": profile["default_handicap"],
                    "event_id": event["id"],
                    "user_id": pid,
                }
            )
            .execute()
            .data[0]
        )
        golfer_ids[pid] = golfer["id"]

    for t in season_teams:
        db.table("teams").insert(
            {
                "name": t["name"],
                "event_id": event["id"],
                "player1_id": golfer_ids.get(t["player1_user_id"]),
                "player2_id": golfer_ids.get(t["player2_user_id"]),
                "season_team_id": t["id"],
            }
        ).execute()

    return {"share_code": event_code, "admin_pin": pin, "date": body.date.isoformat()}


# ---------- Calendar export ----------


@router.get("/{share_code}/ics")
def league_ics(share_code: str) -> Response:
    """Every scheduled league night as its own calendar entry."""
    league = _get_league(share_code)
    events = (
        get_db()
        .table("events")
        .select("share_code, title, course, date")
        .eq("league_id", league["id"])
        .order("date")
        .execute()
        .data
    )
    ics = build_league_ics(league["name"], share_code, events)
    return Response(
        content=ics,
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="hmb-league.ics"'},
    )
