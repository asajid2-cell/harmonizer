import { readFile } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { runPlan } from '../plans/runner.js';
import type { PlanDefinition } from '../runtime/types.js';

async function loadPlan(): Promise<PlanDefinition> {
  const raw = await readFile(path.resolve('plans/final-exam.plan.json'), 'utf-8');
  return JSON.parse(raw);
}

async function main() {
  const plan = await loadPlan();
  const filePath = path.resolve('../final-exam/dist/index.html');
  const url = pathToFileURL(filePath).href;
  plan.startUrl = url;
  plan.steps = plan.steps.map((step) =>
    step.kind === 'navigate' ? { ...step, url } : step,
  );

  console.log('Running smoke test against', url);
  const results = await runPlan(plan);
  console.table(results);
  const failed = results.find((r) => r.status === 'error');
  if (failed) {
    console.error('Smoke test failed', failed);
    process.exitCode = 1;
  } else {
    console.log('Custom analytics workspace validated via Playwright Code harness.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
