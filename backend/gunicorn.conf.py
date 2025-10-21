import multiprocessing, os

wsgi_app = "backend.app:app"
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
threads = int(os.environ.get("GUNICORN_THREADS", "1"))
timeout = 180
keepalive = 5
loglevel = "info"
