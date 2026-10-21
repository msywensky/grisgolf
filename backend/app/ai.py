"""Claude vision client: reads pars + stroke index off a scorecard photo.

Optional feature — without ANTHROPIC_API_KEY, callers get a 503 and the
frontend degrades to "import" being unavailable, same shape as the
GOLF_COURSE_API_KEY-absent path in routers/courses.py.
"""

from functools import lru_cache
from typing import Optional

import anthropic
from fastapi import HTTPException
from pydantic import BaseModel

from .config import get_settings

SCORECARD_PROMPT = """This is a photo of a golf scorecard. Read the row labeled \
"Par" and the row labeled "Handicap", "HDCP", or "Stroke Index" (whichever is \
printed), one entry per hole, in hole-number order.

Rules:
- Return exactly one entry per hole shown on the card (usually 9 or 18).
- Ignore summary columns (e.g., "Out", "In", "Total") and any other text on the card.
- If the club or course name is printed on the card, put your best guess in \
club_name; if it isn't legible or isn't printed, return an empty string. Do \
not guess.
- If a par or handicap cell is illegible or missing, do not invent a value — \
return par 0 for that hole, or omit handicap (null) for that hole.
"""


class ScorecardHole(BaseModel):
    number: int
    par: int
    handicap: Optional[int] = None


class ScorecardExtract(BaseModel):
    club_name: str
    holes: list[ScorecardHole]


@lru_cache
def get_ai() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=get_settings().anthropic_api_key)


def extract_scorecard(image_b64: str, media_type: str) -> ScorecardExtract:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="Scorecard import isn't set up on this server yet — type the course name instead. 🍺",
        )
    try:
        response = get_ai().messages.parse(
            model=settings.scorecard_model,
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": media_type, "data": image_b64},
                        },
                        {"type": "text", "text": SCORECARD_PROMPT},
                    ],
                }
            ],
            output_format=ScorecardExtract,
        )
    except anthropic.APIError:
        raise HTTPException(
            status_code=502,
            detail="Couldn't read that scorecard right now — try again, or type the course name instead. 🍺",
        )
    return response.parsed_output
