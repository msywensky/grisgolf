"""In-process per-IP rate limiting for public, unauthenticated routes that
cost real money or write to a publicly-readable table (scorecard scan/import).

Memory-only: resets on deploy/restart, and each Cloud Run instance keeps its
own count. That's an accepted tradeoff for this app's scale — see the
accepted-risk note next to the /scan and /import routes in routers/courses.py.
"""

import time
from collections import OrderedDict

from fastapi import HTTPException, Request

WINDOW_SECONDS = 3600.0

# f"{bucket}:{ip}" -> request timestamps within the current window (oldest first).
_hits: OrderedDict[str, list[float]] = OrderedDict()
_HITS_CAP = 5000  # distinct keys tracked before we evict the oldest


def client_ip(request: Request) -> str:
    """Real client IP behind Cloud Run's load balancer, which otherwise makes
    every caller look like the same address on request.client.host."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(request: Request, *, budget: int, bucket: str) -> None:
    """429 once `budget` calls have landed from this IP within the last hour.

    `bucket` namespaces separate limits so unrelated routes don't share a budget.
    """
    key = f"{bucket}:{client_ip(request)}"
    now = time.monotonic()
    hits = [t for t in _hits.get(key, []) if now - t < WINDOW_SECONDS]
    if len(hits) >= budget:
        raise HTTPException(
            status_code=429,
            detail="Whoa, slow down — too many scorecard imports from here this hour. Try again later. 🍺",
        )
    hits.append(now)
    _hits[key] = hits
    _hits.move_to_end(key)
    while len(_hits) > _HITS_CAP:
        _hits.popitem(last=False)
