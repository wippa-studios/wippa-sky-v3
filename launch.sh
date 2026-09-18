#!/bin/bash
# Serve Wippa Sky from this directory (works regardless of folder name).
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-3001}"
python3 -m http.server "$PORT" >/dev/null 2>&1 &
sleep 0.5
xdg-open "http://localhost:$PORT"
