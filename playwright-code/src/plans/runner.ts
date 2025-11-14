import { navigate } from '../api/playwright/navigate.js';
import { waitFor } from '../api/playwright/waitFor.js';
import { click } from '../api/playwright/click.js';
import { type as typeText } from '../api/playwright/type.js';
import { evaluate } from '../api/playwright/evaluate.js';
import { snapshot } from '../api/playwright/snapshot.js';
import { screenshot } from '../api/playwright/screenshot.js';
import { session } from '../runtime/session.js';
import type { PlanDefinition, PlanResult } from '../runtime/types.js';

export async function runPlan(plan: PlanDefinition) {
  const results: PlanResult[] = [];
  for (const step of plan.steps) {
    try {
      switch (step.kind) {
        case 'navigate':
          await navigate(step.url, step.options);
          break;
        case 'waitFor':
          await waitFor(step.options);
          break;
        case 'click':
          await click(step.selector, step.options);
          break;
        case 'type':
          await typeText(step.selector, step.value, step.options);
          break;
        case 'evaluate':
          await evaluate(step.script);
          break;
        case 'snapshot': {
          const snap = await snapshot(step.options);
          results.push({
            stepId: step.id,
            status: 'success',
            artifacts: step.options?.label ? [`snapshot:${step.options.label}`] : undefined,
          });
          continue;
        }
        case 'screenshot': {
          const path = await screenshot(step.options);
          results.push({
            stepId: step.id,
            status: 'success',
            artifacts: path ? [path] : undefined,
          });
          continue;
        }
        default:
          throw new Error(`Unsupported step ${step.kind satisfies never}`);
      }
      results.push({ stepId: step.id, status: 'success' });
    } catch (error) {
      results.push({
        stepId: step.id,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  await session.dispose();
  return results;
}
