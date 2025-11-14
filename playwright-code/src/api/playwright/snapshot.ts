import { session } from '../../runtime/session.js';
import type { SnapshotOptions, PageSnapshot } from '../../runtime/types.js';

/**
 * Capture structured information about the current page.
 */
export async function snapshot(options: SnapshotOptions = {}): Promise<PageSnapshot> {
  const page = await session.getPage();
  const accessibilityTree = await page.accessibility.snapshot({ interestingOnly: false });
  const dom = options.includeDom ? await page.content() : undefined;

  const payload: PageSnapshot = {
    url: page.url(),
    title: await page.title(),
    timestamp: new Date().toISOString(),
    dom,
    accessibilityTree,
  };

  if (options.persist !== false && options.label) {
    await session.writeArtifact('snapshots', `${options.label}.json`, Buffer.from(JSON.stringify(payload, null, 2)));
  }

  return payload;
}
