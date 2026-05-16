# Playwright Helper

This directory contains local Playwright tests and helper code for checking Harmonizer pages during development.

## Install

```bash
cd playwright-code
npm install
npx playwright install chromium
```

## Run Tests

```bash
npm test
```

Run a single test by passing the test file to Playwright:

```bash
npx playwright test src/tests/darkmode.test.ts
```

## Add A Test

Create tests under `src/tests/` and keep reusable browser actions under `src/api/playwright/`.

Generated screenshots, traces, and reports belong in ignored artifact folders. Do not commit raw Playwright output unless a file has been deliberately curated as public documentation.

## Project Layout

```text
src/
  api/playwright/   shared browser helpers
  analysis/         screenshot analysis helpers
  plans/            plan runner utilities
  runtime/          session/runtime types
  tests/            Playwright tests
```
