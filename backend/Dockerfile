# Python 3.11の軽量イメージを使用
FROM python:3.11-slim-bookworm

# ユーザーをrootに明示的に設定（Renderの一部環境での権限エラー回避）
USER root

# stdout/stderr logs to show up in container logs immediately
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
# build-essential: for compiling python packages (uvloop, etc.)
# ffmpeg: for audio processing
# apt-get clean and rm -rf lists logic might be causing read-only fs issues on some platforms
# Trying a simpler approach
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8000
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
