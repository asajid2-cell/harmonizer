import { session } from '../../runtime/session.js';

/**
 * Evaluate JavaScript in the page context.
 */
export async function evaluate<T>(fn: string | ((...args: unknown[]) => T), arg?: unknown): Promise<T> {
  const page = await session.getPage();
  if (typeof fn === 'string') {
    // Wrap string expressions/functions into an executable function.
    const wrapped = new Function(`return (${fn});`)();
    return page.evaluate(wrapped as any, arg);
  }
  return page.evaluate(fn as any, arg);
}
