import multiprocessing, os

wsgi_app = "backend.app:app"
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"

# Optimized for 2GB RAM VPS - use 1 worker with 4 threads instead of 2 workers
# This reduces memory footprint while maintaining concurrency
workers = int(os.environ.get("WEB_CONCURRENCY", "1"))
threads = int(os.environ.get("GUNICORN_THREADS", "4"))

timeout = 180
keepalive = 5
loglevel = "info"

# Enable worker restart to prevent memory leaks
max_requests = 1000
max_requests_jitter = 50

# Preload app to save memory (shared model loading)
preload_app = True
