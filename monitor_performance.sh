#!/bin/bash
# VPS Performance Monitor - quick resource snapshot

echo "========================================"
echo "   VPS PERFORMANCE MONITOR"
echo "========================================"
echo

echo "[1] Memory Usage"
free -h | grep -E "Mem:|Swap:"
echo

echo "[2] CPU Load"
uptime
echo

echo "[3] Disk Usage (root)"
df -h / | tail -n 1
echo

echo "[4] Docker Container Stats"
if command -v docker >/dev/null 2>&1; then
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
else
  echo "Docker not installed or not in PATH."
fi
echo

echo "[5] Top 5 Memory Consumers"
ps aux --sort=-%mem | head -6
echo

echo "[6] Swap Usage Check"
SWAP_USED=$(free | awk '/Swap:/ {print $3}')
if [ "${SWAP_USED}" -gt 0 ]; then
  echo "WARNING: System is using swap (${SWAP_USED} KB). Consider reducing worker count or upgrading RAM."
else
  echo "Swap usage: 0 KB"
fi
echo

echo "[7] Recent OOM Killer Events"
if command -v dmesg >/dev/null 2>&1; then
  dmesg | grep -i "killed process" | tail -3 || echo "None detected."
else
  echo "dmesg not available."
fi
echo

echo "[8] Active TCP Connections"
if command -v ss >/dev/null 2>&1; then
  ss -s | grep -E "TCP:"
else
  echo "ss command not available."
fi
echo

echo "Tips:"
echo "- Keep memory usage under ~1.5 GB to avoid swapping."
echo "- Restart stack if swap spikes: sudo docker compose restart"
echo "- Continuous watch: watch -n 5 free -h"
echo "- Logs: sudo docker compose logs -f --tail=100"
