import { session } from '../../runtime/session.js';
/**
 * Evaluate JavaScript in the page context.
 */
export async function evaluate(fn, arg) {
    const page = await session.getPage();
    if (typeof fn === 'string') {
        // Wrap string expressions/functions into an executable function.
        const wrapped = new Function(`return (${fn});`)();
        return page.evaluate(wrapped, arg);
    }
    return page.evaluate(fn, arg);
}
