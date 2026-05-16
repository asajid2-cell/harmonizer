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

# copy requirements first to maximize layer caching
COPY requirements.txt ./
COPY backend/analysis/requirements.txt backend/analysis/requirements.txt

# install CPU-only torch/vision before the rest (requirements.txt has these commented out)
RUN pip install --upgrade pip && \
    pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision && \
    pip install -r requirements.txt

COPY . .

RUN mkdir -p backend/uploads backend/data

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--timeout", "600", "--workers", "1", "--access-logfile", "-", "--error-logfile", "-", "--log-level", "info", "backend.app:app"]
