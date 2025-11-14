import { session } from '../../runtime/session.js';
import type { WaitForOptions } from '../../runtime/types.js';

/**
 * Wait for selector/text conditions.
 */
export async function waitFor(options: WaitForOptions) {
  const page = await session.getPage();
  if (options.selector) {
    await page.waitForSelector(options.selector, {
      state: options.state ?? 'visible',
      timeout: options.timeoutMs ?? 10000,
    });
    return;
  }

  if (options.text) {
    await page.waitForFunction(
      (needle) => document.body?.innerText?.includes(needle) ?? false,
      options.text,
      { timeout: options.timeoutMs ?? 10000 },
    );
    return;
  }

  if (options.timeoutMs) {
    await page.waitForTimeout(options.timeoutMs);
  }
}
