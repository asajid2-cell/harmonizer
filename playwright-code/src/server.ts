import express from 'express';
import { runPlan } from './plans/runner.js';
import type { PlanDefinition } from './runtime/types.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Playwright code server ready' });
});

app.post('/run-plan', async (req, res) => {
  try {
    const plan = req.body as PlanDefinition;
    if (!plan || !plan.steps?.length) {
      return res.status(400).json({ error: 'Invalid plan payload' });
    }
    const results = await runPlan(plan);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Playwright code server listening on http://localhost:${port}`);
});
