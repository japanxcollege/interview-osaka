# Python 3.11 (Debian Bookworm) Lightweight
FROM python:3.11-slim-bookworm

# stdout/stderr logs to show up in container logs immediately
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
# build-essential: for compiling python packages (uvloop, etc.)
# ffmpeg: for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8000
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
