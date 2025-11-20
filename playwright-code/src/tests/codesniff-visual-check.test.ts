import { chromium } from "playwright";
import { spawn } from "child_process";
import path from "path";

const FRONTEND_DIR = path.resolve("../codesniff/frontend");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";


function runCommand(cmd: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: "inherit", shell: true });
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
      }
    });
    proc.on("error", reject);
  });
}

function startPreview() {
  return new Promise<{ stop: () => void; ready: Promise<void> }>((resolve) => {
    const proc = spawn(npmCmd, ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4173"], {
      cwd: FRONTEND_DIR,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    const ready = new Promise<void>((readyResolve, readyReject) => {
      const onData = (data: Buffer) => {
        const text = data.toString();
        process.stdout.write(text);
        if (text.includes("Local:")) {
          proc.stdout?.off("data", onData);
          readyResolve();
        }
      };

      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", (data) => process.stderr.write(data));
      proc.on("exit", (code) => {
        if (code !== 0) {
          readyReject(new Error(`preview exited with code ${code}`));
        }
      });
    });

    resolve({
      stop: () => {
        proc.kill();
      },
      ready,
    });
  });
}

(async () => {
  console.log("Building CodeSniff frontend before running visual test...\n");
  await runCommand(npmCmd, ["run", "build"], FRONTEND_DIR);

  console.log("\nStarting Vite preview on http://127.0.0.1:4173 ...\n");
  const preview = await startPreview();
  await preview.ready;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4173/codesniff-app/", { waitUntil: "networkidle" });

  // Ensure hero visualization loaded
  await page.waitForSelector(".vector-plane__surface", { timeout: 10000 });

  const headerCount = await page.locator(".semantic-hero__header").count();
  console.log("semantic-hero__header count:", headerCount);

  const nativeSelectCount = await page.locator("#results-limit").count();
  console.log("native select count:", nativeSelectCount);

  const pillButtonExists = (await page.locator(".pill-control__button").count()) > 0;
  console.log("custom pill button visible:", pillButtonExists);

  const heroGradients = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".hero-stage");
    if (!el) return null;
    const styles = window.getComputedStyle(el);
    const after = window.getComputedStyle(el, "::after");
    return {
      background: styles.backgroundImage,
      after: after.backgroundImage,
      afterHeight: after.height,
    };
  });
  console.log("hero gradients:", heroGradients);

  await page.screenshot({ path: "playwright-code/artifacts/codesniff-verification.png", fullPage: true });
  console.log("Screenshot saved to playwright-code/artifacts/codesniff-verification.png");

  await browser.close();
  preview.stop();

  if (headerCount !== 0) {
    throw new Error("Old FUNCTION header still present in visualization.");
  }
  if (nativeSelectCount !== 0 || !pillButtonExists) {
    throw new Error("Results selector is still using native <select> element.");
  }
  if (!heroGradients || !heroGradients.after?.includes("linear-gradient")) {
    throw new Error("Hero background gradient did not extend/presence not detected.");
  }

  console.log("\nCodesniff visual verification passed.");
})().catch((error) => {
  console.error("Codesniff visual verification failed:", error);
  process.exit(1);
});
