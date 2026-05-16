# Security Policy

## Supported Branch

Use `main` for the public source snapshot. Older branches are development history and are not maintained as public release branches.

## Report A Vulnerability

Use a private GitHub security advisory if available, or contact the repository owner directly. Do not publish working exploits, credentials, private data, or reproduction material that exposes another system.

## Secrets

Secrets belong in a local `.env` file. The example file contains placeholders only.

If a real credential is ever committed, rotate it immediately. Deleting it from the current tree is not enough because Git history can still expose it.

## Runtime Data

Do not commit:

- uploads or downloaded media;
- local SQLite databases;
- generated analysis data;
- browser cookies;
- model checkpoints;
- local SDK installs;
- generated Playwright artifacts.

The public tree is designed so these paths are ignored by default.
