# Usage Guide

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   npx playwright install chromium
   ```

2. Run the example test:
   ```bash
   npm run test:darkmode
   ```

3. Create your own test in `src/tests/your-test.test.ts`

## Writing Tests

Basic test structure:

```typescript
import { test, expect } from '@playwright/test';

test('your test name', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Interact with page
  await page.click('button');
  await page.fill('input[name="email"]', 'test@example.com');

  // Make assertions
  await expect(page.locator('h1')).toHaveText('Welcome');
});
```

## Available Helpers

The framework provides wrappers in `src/api/playwright/`:

- **navigate(page, url)** - Load a page
- **click(page, selector)** - Click an element  
- **snapshot(page)** - Capture accessibility tree
- **evaluate(page, fn)** - Run JavaScript in page context

## Viewing Results

Test artifacts are saved to `artifacts/`:
- Screenshots
- Traces (for debugging)
- Accessibility snapshots

Open traces with:
```bash
npx playwright show-trace artifacts/trace.zip
```

## Configuration

Edit `playwright.config.ts` to:
- Change browser settings
- Set viewport sizes
- Configure test timeouts
- Enable/disable screenshots
