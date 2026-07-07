"""Tiny hand-rolled ICS builder — one weekly-recurring all-morning tee time.

No library needed: the format is line-based text and our needs are humble.
"""

from datetime import date, datetime, timezone


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;")


def build_ics(title: str, course: str, start: date, share_code: str, weeks: int = 52) -> str:
    """A weekly RRULE series starting on the event date, 8am–noon local time."""
    dtstart = start.strftime("%Y%m%dT080000")
    dtend = start.strftime("%Y%m%dT120000")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//HMB Scramble//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:hmb-{share_code}@hmbscramble",
        f"DTSTAMP:{stamp}",
        f"DTSTART:{dtstart}",
        f"DTEND:{dtend}",
        f"RRULE:FREQ=WEEKLY;COUNT={weeks}",
        f"SUMMARY:{_escape('🍺⛳ ' + title)}",
        f"LOCATION:{_escape(course)}",
        f"DESCRIPTION:{_escape('Weekly 2v2 scramble. Bring your A-game and a cooler.')}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    # ICS spec wants CRLF line endings
    return "\r\n".join(lines) + "\r\n"
