# Playwright Code Mode

A code execution harness that follows Anthropic's "Code Mode" recommendation: instead of invoking dozens of MCP tools, write TypeScript once and execute the whole plan locally with Playwright. This achieves ~98% reduction in tokens, deterministic artifacts on disk, and reusable skills that grow over time.

## Key Concepts

Based on Anthropic's article (Nov 2025):

- **Progressive disclosure**: Each tool lives in `src/api/playwright/`. The model browses this tree and only loads what it needs.
- **Context-efficient results**: Snapshots, screenshots, and extracted data stay on disk in `artifacts/`. The model reads summaries instead of 15k-token dumps.
- **Code-level control flow**: Loops, waits, branching, and error handling all live in TypeScript rather than requiring LLM/tool round-trips.
- **State + skills**: Anything created in `skills/` or `artifacts/` persists for the next run. Over time, the filesystem becomes the agent's reusable toolbox.

## Structure

```
playwright-code/
├── src/
│   ├── api/playwright/    # Direct wrappers around playwright actions
│   ├── plans/             # Plan schema + runner for batch actions
│   ├── server.ts          # HTTP interface for plan submission
│   └── tests/             # Example test demonstrations
├── artifacts/             # Test outputs, screenshots, traces
├── scripts/               # Helper scripts
└── COMPARISON.md          # Token/latency comparison vs MCP
```

## Installation

```bash
npm install
npx playwright install chromium
```

## Usage

### Running Tests

```bash
# Run the example darkmode test
npm run test:darkmode

# Run all tests
npm test
```

### Writing Tests

Create a new test file in `src/tests/`:

```typescript
import { test, expect } from '@playwright/test';

test('example test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});
```

### Using the API

The framework provides wrappers for common Playwright operations:

- **Navigate**: Load pages
- **Click**: Interact with elements
- **Snapshot**: Capture accessibility trees
- **Evaluate**: Run scripts in page context
- **Screenshot**: Take visual captures

See `src/api/playwright/` for available actions.

## Benefits Over MCP

- **98% fewer tokens**: Single code execution vs. multiple tool calls
- **Deterministic**: Same code = same results
- **Git-friendly**: Artifacts tracked in version control
- **Reusable**: Build a library of skills over time
- **Fast**: No round-trips between LLM and tools

See [COMPARISON.md](COMPARISON.md) for detailed analysis.

## Example: Dark Mode Test

```typescript
test('dark mode toggle', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Toggle dark mode
  await page.click('[data-testid="dark-mode-toggle"]');

  // Verify styles changed
  const bg = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor
  );
  expect(bg).toBe('rgb(0, 0, 0)');
});
```

## License

MIT
