#!/bin/zsh
set -eu

APP_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$APP_DIR"
LOG_FILE="$APP_DIR/launch.log"

exec >>"$LOG_FILE" 2>&1
echo "---- $(date '+%Y-%m-%d %H:%M:%S') Shortcut Mapper.app launch ----"

if [ ! -x ".venv/bin/python" ]; then
  echo "Creating .venv"
  python3 -m venv .venv
fi

if ! ".venv/bin/python" - <<'PY' >/dev/null 2>&1
import webview
import pynput
import serial
PY
then
  echo "Installing dependencies"
  ".venv/bin/python" -m pip install -r requirements.txt
fi

echo "Starting application"
exec ".venv/bin/python" main.py
