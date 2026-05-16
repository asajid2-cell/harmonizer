/**
 * Direct filesystem API for Playwright automation.
 * Each function mirrors a common MCP tool but is callable directly from code
 * for Anthropic's 98% token-reduction pattern.
 */
export { navigate } from './navigate.js';
export { click } from './click.js';
export { type as typeText } from './type.js';
export { waitFor } from './waitFor.js';
export { evaluate } from './evaluate.js';
export { snapshot } from './snapshot.js';
export { screenshot } from './screenshot.js';
