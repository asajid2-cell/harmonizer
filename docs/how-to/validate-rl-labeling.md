# Validate RL Labeling

Use this checklist before trusting an RL-assisted jump policy during local playback.

## 1. Generate Snippets

```bash
make rl-snippets
```

Expected result:

- audio snippets are created under `backend/data/rl/`;
- the command exits without errors;
- no generated files are staged for commit.

## 2. Open The Labeler

Start the main app, then open:

```text
http://localhost:5000/rl/labeler
```

Expected result:

- the labeler loads;
- snippets can be played;
- labels save to the local SQLite database.

## 3. Train The Local Policy

```bash
make rl-train
```

Expected result:

- training completes;
- local model output is written under `backend/data/rl/`;
- `/api/rl/model` returns current model metadata.

## 4. Check Runtime Behavior

Run the app with RL disabled first. Confirm that baseline playback still works.

Then enable the RL policy mode and check:

- no browser console errors appear;
- `/api/rl/telemetry` returns policy and label counts;
- jump decisions still fall back safely when model data is missing.

## 5. Check Git Hygiene

```bash
git status --short
git ls-files | rg "backend/data/rl|rl.sqlite3|jump_events\\.jsonl"
```

The `git ls-files` command should not list local runtime data.
