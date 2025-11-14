import { session } from '../../runtime/session.js';

/**
 * Evaluate JavaScript in the page context.
 */
export async function evaluate<T>(fn: string | ((...args: unknown[]) => T), arg?: unknown): Promise<T> {
  const page = await session.getPage();
  return page.evaluate(fn as any, arg);
}
