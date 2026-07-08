# HMB Scramble API — Cloud Run image
FROM python:3.12-slim

# Cloud Run wants a fast, quiet, non-root container.
RUN useradd --create-home --uid 1000 appuser
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

USER appuser

# Cloud Run injects $PORT (defaults to 8080) — must bind to it, not a fixed port.
ENV PORT=8080
EXPOSE 8080

CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
