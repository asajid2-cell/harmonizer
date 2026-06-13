#!/usr/bin/env python3
# Add the hl-auth env vars to the watch-together service in docker-compose.web.yml.
import sys
P = "/home/harmonizer/lms-vps/docker-compose.web.yml"
s = open(P).read()
if "AUTH_INTERNAL_URL" in s:
    print("env already present — no change")
    sys.exit(0)
anchor = "      BASE_PATH: /mediamtx"
if anchor not in s:
    print("ANCHOR NOT FOUND — aborting")
    sys.exit(1)
add = (
    "\n      AUTH_INTERNAL_URL: http://127.0.0.1:4200"
    "\n      AUTH_INTERNAL_KEY: ${HL_AUTH_INTERNAL_KEY:?set HL_AUTH_INTERNAL_KEY in .env}"
    "\n      AUTH_PUBLIC_BASE: /auth"
    "\n      AUTH_COOKIE_NAME: hl_session"
    "\n      AUTH_APP_PREFIX: /mediamtx"
)
s = s.replace(anchor, anchor + add, 1)
open(P, "w").write(s)
print("added hl-auth env to watch-together")
