# Contributing

Harmonizer is a public research and demo workspace. Contributions should be scoped, reproducible, and clear about which tool they affect.

## Set Up

1. Copy `.env.example` to `.env`.
2. Set `SECRET_KEY`.
3. Follow [Getting started](docs/tutorials/getting-started.md).

## Before A Pull Request

Run the checks that match the area you changed:

```bash
python -m compileall backend
node --check frontend/js/eldrichify.js
docker compose config
```

For CodeSniff backend work:

```bash
cd codesniff/backend
python -m pytest
```

## Documentation

Use the Diataxis layout:

- tutorials for first-time learning paths;
- how-to guides for task recipes;
- reference pages for settings, paths, and endpoints;
- explanation pages for design context.

Avoid private planning notes, generated audit logs, and one-off implementation diaries in public docs.

## Do Not Commit

- `.env` files or secrets;
- database files;
- uploaded or downloaded media;
- browser cookies;
- model checkpoints;
- dependency folders;
- build outputs;
- raw Playwright screenshots, traces, or reports.

## Pull Request Notes

Include:

- what changed;
- how it was tested;
- any new environment variables;
- any local data migration or cleanup needed.
