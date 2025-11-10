"""Print RL telemetry using SQLite directly."""

from __future__ import annotations

import json
import os

from . import db

RL_MODEL_PATH = db.DATA_DIR / "model.json"


def main():
    queue_counts = db.get_queue_counts()
    label_summary = db.get_label_summary()
    policy_counts = db.get_policy_counts()
    model_meta = None
    if RL_MODEL_PATH.exists():
        with RL_MODEL_PATH.open("r", encoding="utf-8") as handle:
            model_meta = json.load(handle)
    override = os.environ.get("RL_POLICY_MODE")
    epsilon = float(os.environ.get("RL_POLICY_EPS", "0.1"))
    telemetry = {
        "policy": {
            "override": override,
            "epsilon": epsilon,
            "counts": policy_counts,
        },
        "queue_counts": queue_counts,
        "label_summary": label_summary,
        "model": model_meta,
    }
    print(json.dumps(telemetry, indent=2))


if __name__ == "__main__":
    main()
