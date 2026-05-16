from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

import app as harmonizer_app  # noqa: E402


if __name__ == "__main__":
    init_db = harmonizer_app._ourspace_db_helpers.get("init_db")
    if init_db:
        try:
            init_db()
        except Exception as exc:
            print(f"[OurSpace] Database initialization warning: {exc}")
    harmonizer_app.app.run(
        host="127.0.0.1",
        port=4000,
        debug=False,
        use_reloader=False,
        threaded=True,
    )
