import path from 'path';
import { session } from '../../runtime/session.js';
import type { ScreenshotOptions } from '../../runtime/types.js';

/**
 * Capture a screenshot and persist to artifacts folder.
 */
export async function screenshot(options: ScreenshotOptions = {}) {
  const page = await session.getPage();
  const buffer = await page.screenshot({ fullPage: options.fullPage ?? true });
  const label = options.label ?? 'screenshot';
  const targetPath =
    options.path ??
    (await session.writeArtifact('screenshots', `${label}.png`, buffer));

  if (options.path) {
    const absolute = path.resolve(options.path);
    await session.writeArtifact('screenshots', path.basename(absolute), buffer);
    return absolute;
  }

  return targetPath;
}
