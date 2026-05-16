"""
Train a gradient boosted jump-quality model and export as JSON.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from typing import Dict, Tuple

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor

from . import db

MODEL_PATH = db.MODEL_PATH
FEATURE_NAMES = [
    "similarity",
    "span_norm",
    "same_section",
    "mode_jukebox",
    "mode_eternal",
    "delta_beats",
    "dwell_norm",
    "tempo_norm",
    "source_confidence",
    "target_confidence",
    "source_duration_norm",
    "target_duration_norm",
    "time_from_start_norm",
    "time_to_end_norm",
]
LABEL_MAP = {"good": 1.0, "meh": 0.5, "bad": 0.0}


def _get_setting(settings: Dict, keys: Tuple[str, ...], default: float = 0.0) -> float:
    for key in keys:
        if key in settings:
            try:
                return float(settings[key])
            except (TypeError, ValueError):
                continue
    return default


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _extract_features(row) -> Dict[str, float]:
    mode = (row["mode"] or "canon").lower()
    similarity = float(row["similarity"]) if row["similarity"] is not None else 0.0
    span_norm = float(row["span"]) / 64.0 if row["span"] is not None else 0.0
    same_section = 1.0 if row["same_section"] else 0.0
    delta_beats = abs(float(row["target_index"] - row["source_index"])) / 128.0

    try:
        settings = json.loads(row["settings"] or "{}")
    except json.JSONDecodeError:
        settings = {}
    dwell = _get_setting(
        settings,
        ("dwellBeats", "dwell_beats", "minLoopBeats", "minOffsetBeats"),
        default=8.0,
    )
    dwell_norm = float(dwell) / 64.0

    try:
        context = json.loads(row["context"] or "{}")
    except (json.JSONDecodeError, TypeError):
        context = {}

    track_tempo = _safe_float(context.get("track_tempo"), 0.0)
    tempo_norm = track_tempo / 200.0
    source_conf = _safe_float(context.get("source_confidence"), 0.0)
    target_conf = _safe_float(context.get("target_confidence"), 0.0)
    source_duration_norm = _safe_float(context.get("source_duration"), 0.0) / 10.0
    target_duration_norm = _safe_float(context.get("target_duration"), 0.0) / 10.0
    track_duration = _safe_float(context.get("track_duration"), 0.0)
    source_time = context.get("source_time")
    if source_time is None:
        source_time = row["source_time"]
    source_time = _safe_float(source_time, 0.0)
    target_time = context.get("target_time")
    if target_time is None:
        target_time = row["target_time"]
    target_time = _safe_float(target_time, 0.0)
    time_from_start_norm = (
        source_time / track_duration if track_duration > 0 else source_time / 300.0
    )
    time_from_end = context.get("time_from_end")
    if time_from_end is None and track_duration > 0:
        time_from_end = track_duration - target_time
    time_from_end = _safe_float(time_from_end, 0.0)
    time_to_end_norm = (
        time_from_end / track_duration if track_duration > 0 else time_from_end / 300.0
    )

    return {
        "similarity": similarity,
        "span_norm": span_norm,
        "same_section": same_section,
        "mode_jukebox": 1.0 if mode == "jukebox" else 0.0,
        "mode_eternal": 1.0 if mode == "eternal" else 0.0,
        "delta_beats": delta_beats,
        "dwell_norm": dwell_norm,
        "tempo_norm": tempo_norm,
        "source_confidence": source_conf,
        "target_confidence": target_conf,
        "source_duration_norm": source_duration_norm,
        "target_duration_norm": target_duration_norm,
        "time_from_start_norm": time_from_start_norm,
        "time_to_end_norm": time_to_end_norm,
    }


def load_dataset():
    with db.db_cursor() as cur:
        cur.execute(
            """
            SELECT mode, similarity, span, same_section, label,
                   source_index, target_index, source_time, target_time,
                   settings, context
            FROM jump_events
            WHERE label IN ('good','meh','bad')
            """
        )
        rows = cur.fetchall()
    X = []
    y = []
    label_counts = Counter()
    for row in rows:
        label = (row["label"] or "").lower()
        if label not in LABEL_MAP:
            continue
        features = _extract_features(row)
        X.append([features[name] for name in FEATURE_NAMES])
        y.append(LABEL_MAP[label])
        label_counts[label] += 1
    return np.array(X, dtype=float), np.array(y, dtype=float), label_counts


def export_model(ensemble: GradientBoostingRegressor, label_counts, samples):
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    trees = []
    for est in ensemble.estimators_.ravel():
        tree = est.tree_
        nodes = []
        for idx in range(tree.node_count):
            node = {
                "feature": int(tree.feature[idx]),
                "threshold": float(tree.threshold[idx]),
                "left": int(tree.children_left[idx]),
                "right": int(tree.children_right[idx]),
                "value": float(tree.value[idx][0][0]),
                "leaf": bool(tree.children_left[idx] == tree.children_right[idx]),
            }
            nodes.append(node)
        trees.append(nodes)
    model = {
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "type": "gbrt",
        "label_counts": dict(label_counts),
        "samples": samples,
        "feature_names": FEATURE_NAMES,
        "learning_rate": ensemble.learning_rate,
        "base_score": float(ensemble.init_.constant_[0][0]),
        "trees": trees,
    }
    MODEL_PATH.write_text(json.dumps(model, indent=2), encoding="utf-8")
    return model


def main():
    X, y, label_counts = load_dataset()
    if len(X) < 30:
        print("Not enough labeled samples to train gradient model (need >=30).")
        dummy = {
            "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "type": "empty",
            "label_counts": dict(label_counts),
            "samples": len(X),
        }
        MODEL_PATH.write_text(json.dumps(dummy, indent=2), encoding="utf-8")
        return
    model = GradientBoostingRegressor(
        n_estimators=60,
        max_depth=3,
        learning_rate=0.08,
        subsample=0.8,
        random_state=42,
    )
    model.fit(X, y)
    exported = export_model(model, label_counts, len(X))
    print(f"Trained GBRT model on {exported['samples']} samples -> {MODEL_PATH}")
    print(json.dumps(exported["label_counts"], indent=2))


if __name__ == "__main__":
    main()
