# RL Validation Checklist

Use this before relying on the RL-assisted jump policy.

## Data

- [ ] `make rl-snippets` generates clips without errors.
- [ ] Runtime files appear under `backend/data/rl/`.
- [ ] No runtime data is staged for commit.

## Labeling

- [ ] `/rl/labeler` loads locally.
- [ ] Votes save to SQLite.
- [ ] Keyboard shortcuts work where expected.

## Training

- [ ] `make rl-train` completes.
- [ ] `backend/data/rl/model.json` is written locally.
- [ ] `/api/rl/model` returns current metadata.

## Runtime

- [ ] Baseline playback still works with RL disabled.
- [ ] RL mode loads the model without browser console errors.
- [ ] `/api/rl/telemetry` reports policy and label counts.
