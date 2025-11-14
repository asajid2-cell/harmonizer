# Playwright Code Mode

Code execution harness that mirrors Anthropic's "Code Mode" recommendation: instead of invoking dozens of MCP tools, the model writes TypeScript once, and this project executes the whole plan locally with Playwright. The result is a ~98% reduction in tokens, deterministic artifacts on disk, and reusable skills that grow over time.

Key ideas from the Anthropic article (Nov 2025):

- **Progressive disclosure**: Each tool lives in src/api/playwright/. The model browses this tree and only loads what it needs.
- **Context-efficient results**: Snapshots, screenshots, and extracted data stay on disk in rtifacts/; the model reads summaries instead of 15k-token dumps.
- **Code-level control flow**: Loops, waits, branching, and error handling all live in TypeScript rather than requiring LM/tool round-trips.
- **State + skills**: Anything created in skills/ or rtifacts/ persists for the next run. Over time, the filesystem becomes the agent's reusable toolbox.

This folder contains:

- src/api/playwright/ – direct wrappers around playwright actions (navigate, click, snapshot, evaluate, etc.).
- src/plans/ – plan schema + runner that batch actions without tool chatter.
- src/server.ts – HTTP interface to submit plans/code for execution (single round-trip).
- src/tests/ – runnable demos, including the dark-mode UI spec from the chat.
- COMPARISON.md – token, latency, and feature comparison between MCP and this code-first approach.

Run 
pm install, 
px playwright install chromium, and 
pm run test:darkmode to see the system drive the custom test page while emitting artifacts and logs.
