# Security Policy

## Supported Versions

This public branch is the only supported source snapshot. Older branches may contain private development history and are not maintained as public release branches.

## Reporting

Open a private security advisory on GitHub if available, or contact the repository owner directly. Do not publish working exploits, secrets, or private user data in an issue.

## Secrets And Runtime Data

The app expects secrets in `.env`, which is ignored. Runtime databases, uploads, generated analysis data, cookies, model checkpoints, and local SDK installs should not be committed.

If a real credential has ever been committed, rotate it. Removing it from the current tree is not enough.
