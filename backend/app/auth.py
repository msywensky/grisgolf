"""Supabase JWT verification for league routes.

League endpoints are the trusted lane: the frontend sends the user's Supabase
access token, we ask GoTrue who it belongs to, and routes get a verified
user id. Casual-event routes stay pin-based and never touch this.
"""

from typing import Optional

from fastapi import Header, HTTPException

from .db import get_db


def require_user(authorization: Optional[str] = Header(default=None)) -> str:
    """FastAPI dependency: verify the Bearer token, return the user id."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in required for league stuff. 🍺")
    token = authorization.split(" ", 1)[1].strip()
    try:
        res = get_db().auth.get_user(token)
    except Exception:
        res = None
    if not res or not res.user:
        raise HTTPException(status_code=401, detail="Session expired — sign in again.")
    return res.user.id
