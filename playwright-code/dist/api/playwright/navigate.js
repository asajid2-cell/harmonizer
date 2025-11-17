import { session } from '../../runtime/session.js';
/**
 * Navigate to a URL.
 * Mirrors the MCP browser_navigate tool, but callable directly from code.
 */
export async function navigate(url, options = {}) {
    const page = await session.getPage();
    await page.goto(url, {
        waitUntil: options.waitUntil ?? 'load',
        timeout: options.timeoutMs ?? 30000,
    });
}
