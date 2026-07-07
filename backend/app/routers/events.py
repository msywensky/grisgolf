"""Event lifecycle: create, admin-verify, update, clone, and ICS export."""

import secrets
from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel, Field

from ..db import get_db
from ..ics import build_ics

router = APIRouter(prefix="/api/events", tags=["events"])

# No lookalike characters — these get yelled across a fairway.
CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def _new_share_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def _new_pin() -> str:
    return f"{secrets.randbelow(10000):04d}"


def _get_event(share_code: str) -> dict:
    res = (
        get_db()
        .table("events")
        .select("*")
        .eq("share_code", share_code)
        .maybe_single()
        .execute()
    )
    if not res or not res.data:
        raise HTTPException(status_code=404, detail="Event not found. Wrong link?")
    return res.data


def _require_admin(share_code: str, pin: Optional[str]) -> dict:
    """Return the event if the pin matches, else 403."""
    event = _get_event(share_code)
    res = (
        get_db()
        .table("event_admins")
        .select("pin")
        .eq("event_id", event["id"])
        .maybe_single()
        .execute()
    )
    if not res or not res.data or not pin or res.data["pin"] != pin:
        raise HTTPException(status_code=403, detail="Wrong admin pin. Nice try, sandbagger.")
    return event


# ---------- Create ----------


class CreateEvent(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    course: str = Field(min_length=1, max_length=100)
    date: date
    holes: Literal[9, 18] = 18
    created_by: str = Field(min_length=1, max_length=60)
    admin_pin: Optional[str] = Field(default=None, min_length=4, max_length=4)


@router.post("")
def create_event(body: CreateEvent) -> dict:
    db = get_db()
    share_code = _new_share_code()
    pin = body.admin_pin or _new_pin()

    event = (
        db.table("events")
        .insert(
            {
                "title": body.title,
                "course": body.course,
                "date": body.date.isoformat(),
                "holes": body.holes,
                "status": "upcoming",
                "created_by": body.created_by,
                "share_code": share_code,
            }
        )
        .execute()
        .data[0]
    )
    db.table("event_admins").insert({"event_id": event["id"], "pin": pin}).execute()

    return {"share_code": share_code, "admin_pin": pin}


# ---------- Admin ----------


class VerifyPin(BaseModel):
    pin: str


@router.post("/{share_code}/verify-admin")
def verify_admin(share_code: str, body: VerifyPin) -> dict:
    _require_admin(share_code, body.pin)
    return {"ok": True}


class UpdateEvent(BaseModel):
    title: Optional[str] = None
    course: Optional[str] = None
    date: Optional[date] = None
    status: Optional[Literal["upcoming", "live", "final"]] = None


@router.patch("/{share_code}")
def update_event(
    share_code: str,
    body: UpdateEvent,
    x_admin_pin: Optional[str] = Header(default=None),
) -> dict:
    event = _require_admin(share_code, x_admin_pin)
    patch = {k: (v.isoformat() if isinstance(v, date) else v) for k, v in body.model_dump().items() if v is not None}
    if patch:
        get_db().table("events").update(patch).eq("id", event["id"]).execute()
    return {"ok": True}


# ---------- Clone for Next Weekend ----------


@router.post("/{share_code}/clone")
def clone_event(
    share_code: str,
    x_admin_pin: Optional[str] = Header(default=None),
) -> dict:
    """Copy the whole setup — golfers, teams, course — dated one week later."""
    db = get_db()
    event = _require_admin(share_code, x_admin_pin)

    next_date = (date.fromisoformat(event["date"]) + timedelta(days=7)).isoformat()
    new_code = _new_share_code()

    new_event = (
        db.table("events")
        .insert(
            {
                "title": event["title"],
                "course": event["course"],
                "date": next_date,
                "holes": event["holes"],
                "status": "upcoming",
                "created_by": event["created_by"],
                "share_code": new_code,
            }
        )
        .execute()
        .data[0]
    )
    # Reuse the organizer's pin so their phone unlocks the new event too.
    old_pin = (
        db.table("event_admins").select("pin").eq("event_id", event["id"]).single().execute().data["pin"]
    )
    db.table("event_admins").insert({"event_id": new_event["id"], "pin": old_pin}).execute()

    # Copy golfers, remembering old id -> new id so teams stay intact.
    golfers = db.table("golfers").select("*").eq("event_id", event["id"]).execute().data
    id_map: dict[str, str] = {}
    for g in golfers:
        new_g = (
            db.table("golfers")
            .insert({"name": g["name"], "handicap": g["handicap"], "event_id": new_event["id"]})
            .execute()
            .data[0]
        )
        id_map[g["id"]] = new_g["id"]

    teams = db.table("teams").select("*").eq("event_id", event["id"]).execute().data
    for t in teams:
        db.table("teams").insert(
            {
                "name": t["name"],
                "event_id": new_event["id"],
                "player1_id": id_map.get(t["player1_id"]),
                "player2_id": id_map.get(t["player2_id"]),
            }
        ).execute()

    return {"share_code": new_code, "admin_pin": old_pin, "date": next_date}


# ---------- Calendar export ----------


@router.get("/{share_code}/ics")
def event_ics(share_code: str) -> Response:
    """Weekly-recurring calendar file for the scramble series."""
    event = _get_event(share_code)
    ics = build_ics(
        title=event["title"],
        course=event["course"],
        start=date.fromisoformat(event["date"]),
        share_code=share_code,
    )
    return Response(
        content=ics,
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="hmb-scramble.ics"'},
    )
