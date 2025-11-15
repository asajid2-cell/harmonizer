import { readFile } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { runPlan } from '../plans/runner.js';
import type { PlanDefinition, PlanResult } from '../runtime/types.js';

async function loadPlan(planName: string): Promise<PlanDefinition> {
  const raw = await readFile(path.resolve('plans', planName), 'utf-8');
  return JSON.parse(raw);
}

function wireStartUrl(plan: PlanDefinition, url: string) {
  plan.startUrl = url;
  plan.steps = plan.steps.map((step) => {
    if (step.kind === 'navigate') {
      return { ...step, url };
    }
    return step;
  });
}

async function runOurspacePlan(planName: string) {
  const plan = await loadPlan(planName);
  const htmlPath = path.resolve('..', 'frontend', 'ourspace.html');
  const url = pathToFileURL(htmlPath).href;

  wireStartUrl(plan, url);

  console.log(`Running plan "${plan.name}" against ${url}`);
  const results: PlanResult[] = await runPlan(plan);
  console.table(results);

  const failure = results.find((result) => result.status === 'error');
  if (failure) {
    throw new Error(`Plan ${planName} failed at step ${failure.stepId}: ${failure.error ?? 'unknown error'}`);
  }

  console.log(`Plan "${plan.name}" succeeded. Artifacts available in artifacts/.`);
}

runOurspacePlan('ourspace-ui.plan.json').catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
