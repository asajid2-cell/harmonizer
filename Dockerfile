FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
COPY backend/analysis/requirements.txt backend/analysis/requirements.txt

RUN pip install --upgrade pip && \
    pip install -r requirements.txt

COPY . .

RUN mkdir -p backend/uploads backend/data

EXPOSE 5000

# Match production compose settings: longer timeout + single worker for heavy analysis.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--timeout", "600", "--workers", "1", "--access-logfile", "-", "--error-logfile", "-", "--log-level", "info", "backend.app:app"]
