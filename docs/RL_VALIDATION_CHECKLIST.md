# RL Validation Checklist

Before shipping the RL-assisted jump policy, walk through this list:

1. **Data freshness**
   - [ ] `make rl-watch` is running (or a cron job) so new jumps become snippets.
   - [ ] `make rl-snippets` generates clips without errors.

2. **Labeling workflow**
   - [ ] `/rl/labeler` loads with `RL_LABELER_TOKEN`, hotkeys work.
   - [ ] Labels show up in SQLite (`label` / `labeled_at` columns change).

3. **Model training**
   - [ ] `make rl-train` completes and writes `backend/data/rl/model.json`.
   - [ ] `/api/rl/model` returns the new metadata (timestamp, sample count).

4. **Policy telemetry**
   - [ ] `make rl-telemetry` shows non-zero policy splits and label counts.
   - [ ] `/api/rl/policy` reports the expected override/epsilon/weights.

5. **Runtime sanity**
   - [ ] In the browser console, confirm `[RL] Loaded jump quality model` and `[RL] Policy assignment`.
   - [ ] Play a track; `/api/rl/jump-event` logs contain `quality_score`, `policy_mode`, `model_version`.

6. **End-to-end smoke test**
   - [ ] Canon mode and Eternal/Jukebox playback still work with RL disabled (`window.HARMONIZER_CONFIG.rlPolicyMode = "baseline"`).
   - [ ] Re-enable RL, confirm weight adjustments in `selectJumpCandidate` logs without runtime errors.

Only after these checks should we move on to formal test automation or deployment.
