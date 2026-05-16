# RL Logging Reference

Harmonizer can record jump-decision events for local labeling and policy experiments. This data is runtime state and is ignored by Git.

## Event Endpoint

When browser-side RL logging is enabled, the visualizer posts jump metadata to:

```text
POST /api/rl/jump-event
```

The exact payload can evolve with the experiment, but events generally include:

- playback mode;
- source and destination beat indices;
- timing information;
- similarity features;
- current visualizer settings;
- policy mode;
- model version.

## Runtime Storage

RL data is written under:

```text
backend/data/rl/
```

Typical local outputs include:

- `rl.sqlite3`
- `jump_events.jsonl`
- generated audio snippets
- local model output
- telemetry summaries

Do not commit this directory.

## Local Commands

| Command | Purpose |
| --- | --- |
| `make rl-snippets` | Generate snippet candidates for labeling. |
| `make rl-train` | Train or update the local jump policy model. |
| `make rl-telemetry` | Inspect local policy and label telemetry. |

## Browser Toggle

Logging can be enabled before loading a track:

```js
window.HARMONIZER_CONFIG = { rlLoggingEnabled: true };
```

Use this only for local experiments unless the deployment has explicit consent and retention rules for collected data.

## Related Configuration

| Variable | Purpose |
| --- | --- |
| `RL_POLICY_MODE` | Selects policy behavior where supported. |
| `RL_POLICY_EPS` | Sets exploration rate. |
| `RL_LABELER_TOKEN` | Optional labeler protection for deployments. |
