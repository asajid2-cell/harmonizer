import { session } from '../../runtime/session.js';
import type { ClickOptions } from '../../runtime/types.js';

/**
 * Click an element via CSS selector.
 */
export async function click(selector: string, options: ClickOptions = {}) {
  const page = await session.getPage();
  await page.click(selector, {
    button: options.button ?? 'left',
    clickCount: options.clickCount ?? 1,
    delay: options.delayMs ?? 0,
  });
}
