#!/usr/bin/env python3
# Idempotently insert the /auth/ location block before the /cloud-squeeze/ block
# in the harmonizerlabs.cc nginx server config. Run with sudo.
import sys

CONF = sys.argv[1] if len(sys.argv) > 1 else "/etc/nginx/sites-available/harmonizer"
BLOCK_FILE = "/home/harmonizer/hl-auth/deploy/nginx-hl-auth.conf"
ANCHOR = "    location /cloud-squeeze/ {"

src = open(CONF).read()
if "location /auth/" in src:
    print("already present — no change")
    sys.exit(0)
if ANCHOR not in src:
    print("ANCHOR NOT FOUND — aborting, no change")
    sys.exit(1)

block = open(BLOCK_FILE).read().rstrip() + "\n\n"
src = src.replace(ANCHOR, block + ANCHOR, 1)
open(CONF, "w").write(src)
print("inserted /auth/ location")
