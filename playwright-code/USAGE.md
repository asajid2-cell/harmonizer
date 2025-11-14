# Usage

1. 
pm install
2. 
px playwright install chromium
3. 
pm run test:darkmode – runs the plan-runner against the custom UI and writes artifacts to rtifacts/
4. 
pm run build && npm start – optional HTTP server for submitting plans programmatically (POST /run-plan).

See COMPARISON.md for cost numbers and src/api/playwright/ for the filesystem-based tool definitions.
