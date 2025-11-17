import { session } from '../../runtime/session.js';
/**
 * Type text into an input.
 */
export async function type(selector, value, options = {}) {
    const page = await session.getPage();
    await page.fill(selector, value, { timeout: 10000 });
    if (options.pressEnter) {
        await page.press(selector, 'Enter');
    }
    if (options.delayMs) {
        await page.waitForTimeout(options.delayMs);
    }
}
