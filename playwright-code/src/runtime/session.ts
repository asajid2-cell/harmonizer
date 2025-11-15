import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export class PlaywrightSession {
  #browser?: Browser;
  #context?: BrowserContext;
  #page?: Page;
  #artifactsDir: string;

  constructor(artifactsDir = path.resolve('artifacts')) {
    this.#artifactsDir = artifactsDir;
  }

  async #ensureStarted() {
    if (!this.#browser) {
      await mkdir(this.#artifactsDir, { recursive: true });
      this.#browser = await chromium.launch({
        headless: true,
        args: ['--allow-file-access-from-files'],
      });
    }
    if (!this.#context) {
      this.#context = await this.#browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
    }
    if (!this.#page) {
      this.#page = await this.#context.newPage();
    }
  }

  async getPage(): Promise<Page> {
    await this.#ensureStarted();
    if (!this.#page) throw new Error('Failed to initialize Playwright page');
    return this.#page;
  }

  async writeArtifact(subDir: string, label: string, data: string | Buffer) {
    const dir = path.join(this.#artifactsDir, subDir);
    await mkdir(dir, { recursive: true });
    const safeLabel = label.replace(/[^a-z0-9_-]+/gi, '_');
    const fileName = `${safeLabel}-${crypto.randomBytes(4).toString('hex')}`;
    const fullPath = path.join(dir, fileName);
    await writeFile(fullPath, data);
    return fullPath;
  }

  get artifactsDir() {
    return this.#artifactsDir;
  }

  async resetContext() {
    if (this.#page) {
      await this.#page.close();
      this.#page = undefined;
    }
    if (this.#context) {
      await this.#context.close();
      this.#context = undefined;
    }
  }

  async dispose() {
    if (this.#page) {
      await this.#page.close();
      this.#page = undefined;
    }
    if (this.#context) {
      await this.#context.close();
      this.#context = undefined;
    }
    if (this.#browser) {
      await this.#browser.close();
      this.#browser = undefined;
    }
  }
}

export const session = new PlaywrightSession();
