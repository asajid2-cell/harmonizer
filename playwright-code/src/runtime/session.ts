import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { chromium, devices, type Browser, type BrowserContext, type Page } from 'playwright';

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | keyof typeof devices;

export class PlaywrightSession {
  #browser?: Browser;
  #context?: BrowserContext;
  #page?: Page;
  #artifactsDir: string;
  #deviceType: DeviceType;

  constructor(artifactsDir = path.resolve('artifacts'), deviceType: DeviceType = 'desktop') {
    this.#artifactsDir = artifactsDir;
    this.#deviceType = deviceType;
  }

  async #ensureStarted() {
    if (!this.#browser) {
      await mkdir(this.#artifactsDir, { recursive: true });
      this.#browser = await chromium.launch({
        headless: false, // Always show browser for debugging
        args: [
          '--allow-file-access-from-files',
          '--disable-blink-features=AutomationControlled', // Hide automation detection
        ],
        slowMo: 100, // Slow down actions by 100ms for easier viewing
      });
    }
    if (!this.#context) {
      // Configure viewport based on device type
      let contextOptions: any = {};

      if (this.#deviceType === 'desktop') {
        contextOptions = { viewport: { width: 1280, height: 720 } };
      } else if (this.#deviceType === 'mobile') {
        // iPhone 12 Pro dimensions
        contextOptions = {
          ...devices['iPhone 12 Pro'],
          viewport: { width: 390, height: 844 },
        };
      } else if (this.#deviceType === 'tablet') {
        // iPad Pro dimensions
        contextOptions = {
          ...devices['iPad Pro'],
          viewport: { width: 1024, height: 1366 },
        };
      } else if (this.#deviceType in devices) {
        // Use specific Playwright device
        contextOptions = devices[this.#deviceType as keyof typeof devices];
      }

      this.#context = await this.#browser.newContext(contextOptions);

      // Log device type being used
      console.log(`🔧 Browser context created with device: ${this.#deviceType}`);
      if (contextOptions.viewport) {
        console.log(`   📐 Viewport: ${contextOptions.viewport.width}x${contextOptions.viewport.height}`);
      }
    }
    if (!this.#page) {
      this.#page = await this.#context.newPage();
    }
  }

  setDeviceType(deviceType: DeviceType) {
    this.#deviceType = deviceType;
    // Force context recreation on next page request
    if (this.#context) {
      this.resetContext();
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

    // Extract extension if present
    const ext = path.extname(label);
    const nameWithoutExt = ext ? label.slice(0, -ext.length) : label;

    const safeLabel = nameWithoutExt.replace(/[^a-z0-9_-]+/gi, '_');
    const fileName = `${safeLabel}-${crypto.randomBytes(4).toString('hex')}${ext}`;
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
