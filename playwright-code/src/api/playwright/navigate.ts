import { session } from '../../runtime/session.js';
import type { NavigateOptions } from '../../runtime/types.js';

/**
 * Navigate to a URL.
 * Mirrors the MCP browser_navigate tool, but callable directly from code.
 */
export async function navigate(url: string, options: NavigateOptions = {}) {
  const page = await session.getPage();
  await page.goto(url, {
    waitUntil: options.waitUntil ?? 'load',
    timeout: options.timeoutMs ?? 30000,
  });
}
