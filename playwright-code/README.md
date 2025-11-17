# Playwrite Code

A lightweight testing framework built on Playwright that reduces token usage by ~98% compared to traditional MCP approaches. Instead of making dozens of tool calls through an LLM, you write TypeScript test code once and execute it locally.

The core idea: write test plans as code, not as sequences of API calls. This makes tests faster, deterministic, and easier to maintain.

## Installation

```bash
npm install
npx playwright install chromium
```

## Usage

Run the example test:

```bash
npm run test:darkmode
```

Run all tests:

```bash
npm test
```

Create a new test in `src/tests/`:

```typescript
import { test, expect } from '@playwright/test';

test('basic navigation', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});
```

The framework provides common operations in `src/api/playwright/`:
- Navigate, click, fill forms
- Take screenshots and accessibility snapshots
- Evaluate JavaScript in page context
- Wait for elements and conditions

## Coding Style

- Use TypeScript for all test files
- Follow existing test structure in `src/tests/`
- Store reusable helpers in `src/api/playwright/`
- Keep artifacts (screenshots, traces) in `artifacts/`
- One test file per feature or page

## Test

Tests live in `src/tests/`. Each test file should be self-contained.

Example structure:
```
src/tests/
  ├── darkmode.test.ts      # Example test
  └── your-feature.test.ts  # Your tests here
```

Artifacts from test runs are saved to `artifacts/` and can be committed to track visual changes over time.

## License

MIT
