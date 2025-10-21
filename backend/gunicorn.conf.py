import multiprocessing
import os

wsgi_app = "backend.app:app"
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
workers = max(2, multiprocessing.cpu_count())
timeout = 120
keepalive = 5
loglevel = "info"
