import { readFile } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { runPlan } from '../plans/runner.js';
import type { PlanDefinition } from '../runtime/types.js';

async function loadPlan(): Promise<PlanDefinition> {
  const raw = await readFile(path.resolve('plans/darkmode.plan.json'), 'utf-8');
  return JSON.parse(raw);
}

async function main() {
  const plan = await loadPlan();
  const htmlPath = path.resolve('src/tests/site/darkmode.html');
  const url = pathToFileURL(htmlPath).href;

  plan.startUrl = url;
  plan.steps = plan.steps.map((step) => {
    if (step.kind === 'navigate') {
      return { ...step, url };
    }
    return step;
  });

  console.log('Running dark mode plan against', url);
  const results = await runPlan(plan);
  console.table(results);

  const failed = results.find((r) => r.status === 'error');
  if (failed) {
    console.error('Plan failed at step', failed.stepId, failed.error);
    process.exitCode = 1;
  } else {
    console.log('Dark mode plan succeeded. Artifacts in artifacts/ folder.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
