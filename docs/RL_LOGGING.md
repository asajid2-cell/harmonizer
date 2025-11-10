# RL Logging & Feedback Loop Scaffold

This branch introduces the first pieces of infrastructure we will use
to experiment with preference‑ or reinforcement‑learning driven jump
selection.  Nothing trains yet, but we now have:

1. **Client-side hooks** – when `window.HARMONIZER_CONFIG.rlLoggingEnabled`
   is `true`, the visualizer emits metadata (mode, beat indices, timings,
   similarity, current settings) for every jump decision.  Events are sent
   via `navigator.sendBeacon` to avoid blocking playback.
2. **Backend ingestion** – `/api/rl/jump-event` persists each event in
   SQLite (`backend/data/rl/rl.sqlite3`) and mirrors to
   `backend/data/rl/jump_events.jsonl` as a backup.
3. **Snippet generator** – `python -m backend.rl.generate_snippets --limit 10`
   renders ± few seconds around pending jumps into
   `backend/data/rl/snippets/`.  Each rendered snippet updates the DB so
   it becomes available for labeling.
4. **Labeling UI** – visit `/rl/labeler` locally to fetch the next
   unlabeled snippet, listen, and submit `good/meh/bad` votes plus notes.
   Labels are saved back into SQLite for training.

## Enabling logging locally

Add this snippet to your browser console before loading the app (or
embed it in a userscript):

```js
window.HARMONIZER_CONFIG = { rlLoggingEnabled: true };
```

Then load a track and let it run; you should see `backend/data/rl/jump_events.jsonl`
and `backend/data/rl/rl.sqlite3` fill up with events.  These files live
inside the existing `backend/data` directory, so they are ignored by Git.

To generate snippets for review (or run continuously):

```bash
make rl-snippets
# or keep a watcher running:
make rl-watch
```

Then open `http://localhost:4000/rl/labeler` (or the appropriate host)
to grade the rendered clips. (Set `RL_LABELER_TOKEN` in your environment
and enter it when the page prompts you; votes are submitted with keyboard
shortcuts `g/m/b/s`.)

When you have enough labels, train/update the model:

```bash
make rl-train
```

This writes `backend/data/rl/model.json`, which the frontend loads to
penalize low-quality jump candidates automatically.  Policy selection is
controlled via `RL_POLICY_MODE` (`auto`, `baseline`, `rl`) and
`RL_POLICY_EPS` (exploration rate).  Every browser session also fetches
`/api/rl/policy` to learn which arm it's assigned to; the assignment is
tracked server-side so we can measure the split.

To inspect telemetry (policy splits, queue counts, label mix, model
metadata):

```bash
make rl-telemetry
```

or hit `GET /api/rl/telemetry`.

## Next steps

- Automate snippet generation (cron / Github Action) so new events get
  rendered without manual CLI runs.
- Improve the labeler UX (auth, keyboard shortcuts, filters) so long
  labeling sessions are comfortable.
- Replace the current gradient model + epsilon-greedy splitter with a
  contextual bandit that adapts dwell/section tweaks based on feedback,
  and expose the telemetry via dashboards/metrics.
