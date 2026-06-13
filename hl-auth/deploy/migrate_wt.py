#!/usr/bin/env python3
# Replace watch-together's hardcoded password gate with the central hl-auth gate.
import re, sys

P = "/home/harmonizer/watch-together/server.js"
s = open(P).read()

if "requireAccess.cjs" in s:
    print("already migrated — no change")
    sys.exit(0)

# 1) Remove the whole hardcoded gate block (comment -> gate middleware), replace
#    with the central gate. Anchored from the gate comment up to the static mount.
start = s.index("// --- simple password gate")
end = s.index("app.use(express.static(")
NEW = (
    "// --- access gate: central hl-auth (per-account). Local/on-box access bypasses; public is gated.\n"
    "const { requireAccess, checkAccess } = require('./requireAccess.cjs');\n"
    "app.use(requireAccess('watch-together'));\n\n"
)
s = s[:start] + NEW + s[end:]

# 2) Gate the WebSocket handshake via the same central check (local bypass applies).
s = s.replace("wss.on('connection', (ws, req) => {", "wss.on('connection', async (ws, req) => {")
s = re.sub(
    r"if \(!gateOk\(req\)\) \{ ws\.close\(\); return; \}[^\n]*",
    "const _gate = await checkAccess(req, 'watch-together'); if (!_gate.ok) { ws.close(); return; }",
    s,
)

# Safety: no stray references to the old gate should remain.
for bad in ["gateOk", "GATE_PASS", "GATE_TOKEN", "GATE_HTML"]:
    if bad in s:
        print(f"ERROR: stray reference to {bad} remains — aborting, no write")
        sys.exit(1)

open(P, "w").write(s)
print("migrated watch-together server.js")
