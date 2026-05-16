# RL Logging And Feedback Loop

The audio visualizer can log jump decisions for later labeling and policy experiments. The runtime data is local and ignored by Git.

## What It Records

When `window.HARMONIZER_CONFIG.rlLoggingEnabled` is `true`, the visualizer sends jump metadata to `/api/rl/jump-event`.

Recorded fields include mode, beat indices, timing, similarity, current settings, policy mode, and model version.

## Runtime Data

RL data is written under:

```text
backend/data/rl/
```

Typical files:

- `rl.sqlite3`
- `jump_events.jsonl`
- generated audio snippets
- trained local model output

Do not commit this directory.

## Local Workflow

Enable logging in the browser before loading a track:

```js
window.HARMONIZER_CONFIG = { rlLoggingEnabled: true };
```

Generate snippets:

```bash
make rl-snippets
```

Open the labeler:

```text
http://localhost:5000/rl/labeler
```

Train/update the local model:

```bash
make rl-train
```

Inspect telemetry:

```bash
make rl-telemetry
```

## Environment

| variable | purpose |
| --- | --- |
| `RL_POLICY_MODE` | `auto`, `baseline`, or `rl`. |
| `RL_POLICY_EPS` | exploration rate. |
| `RL_LABELER_TOKEN` | optional token for labeler deployments that require one. |
