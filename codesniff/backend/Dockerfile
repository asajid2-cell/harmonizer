FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create storage directory
RUN mkdir -p /app/storage

# --- containment -------------------------------------------------------------------
# This service clones arbitrary public repos and accepts uploads, so it must not run as
# root and nothing it fetches may be executable. The rootfs is mounted read-only at run
# time and /tmp (where clones land) is a noexec tmpfs -- see docker-compose.yml.
#
# HF_HOME points into the persistent volume. The 477MB CodeBERT download previously lived
# in the container's writable layer, so every recreate silently re-downloaded it and a
# read-only rootfs would have broken model loading entirely.
ENV HF_HOME=/app/storage/hf \
    HOME=/tmp \
    PYTHONDONTWRITEBYTECODE=1 \
    GIT_TERMINAL_PROMPT=0 \
    GIT_ALLOW_PROTOCOL=https

# /app stays root-owned and world-readable: the app can read its own source but never
# rewrite it, so a file-write bug cannot become persistence.
RUN useradd -u 1102 -r -s /usr/sbin/nologin codesniff
USER 1102

# Expose port
EXPOSE 8000

# Run application with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
