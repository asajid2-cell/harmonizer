# Contributing

This repo is primarily a public snapshot of an experimental creative lab. Contributions are welcome when they are scoped and easy to review.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `SECRET_KEY`.
3. Run `docker compose up --build` or follow `docs/tutorials/getting-started.md`.

## Before Opening A Pull Request

Run the checks that match the area you changed:

```bash
python -m compileall backend
docker compose config
```

For CodeSniff backend work:

```bash
cd codesniff/backend
python -m pytest
```

## Do Not Commit

- `.env` files
- database files
- uploads or downloaded media
- browser cookies
- model checkpoints
- `node_modules/`
- build outputs
- Playwright screenshots or traces unless they are curated docs assets

## Pull Request Notes

Include:

- what changed;
- how you tested it;
- any new environment variables;
- any migration or cleanup needed for runtime data.
