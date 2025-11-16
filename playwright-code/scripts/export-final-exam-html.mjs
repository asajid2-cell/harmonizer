import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const distDir = path.resolve('../final-exam/dist');
const outputPath = path.resolve('artifacts/final-exam.html');

const server = spawn(
  process.platform === 'win32'
    ? `npx.cmd http-server "${distDir}" -p 4175 -s`
    : `npx http-server "${distDir}" -p 4175 -s`,
  {
    stdio: 'inherit',
    cwd: distDir,
    shell: true,
  },
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  await wait(3000);
  console.log('Launching Chromium to capture page…');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log('Navigating to http://127.0.0.1:4175 …');
  await page.goto('http://127.0.0.1:4175', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(2000);
  console.log('Capturing HTML…');
  const html = await page.content();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf-8');
  await browser.close();
  console.log(`Saved rendered HTML to ${outputPath}`);
} catch (error) {
  console.error('Failed to capture HTML:', error);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
}
