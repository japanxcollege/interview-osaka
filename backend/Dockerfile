# Use python 3.11 slim - simpler base
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Download static ffmpeg binary to avoid apt-get permission issues on Render
# Using a widely trusted static build source (johnvansickle or similar via mwader)
# Or simpler: COPY ffmpeg from a multistage build image that has it?
# Let's use mwader/static-ffmpeg image efficiently
COPY --from=mwader/static-ffmpeg:6.0 /ffmpeg /usr/local/bin/
COPY --from=mwader/static-ffmpeg:6.0 /ffprobe /usr/local/bin/

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8000
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
