#!/bin/zsh
set -eu

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
LOG_FILE="$APP_DIR/launch.log"

exec > >(tee -a "$LOG_FILE") 2>&1
echo "---- $(date '+%Y-%m-%d %H:%M:%S') Shortcut Mapper.command launch ----"

echo "Shortcut Mapper を起動しています..."

if [ ! -x ".venv/bin/python" ]; then
  echo "初回セットアップ: Python環境を作成します。"
  python3 -m venv .venv
fi

if ! ".venv/bin/python" - <<'PY' >/dev/null 2>&1
import webview
import pynput
import serial
PY
then
  echo "初回セットアップ: 必要なライブラリをインストールします。"
  ".venv/bin/python" -m pip install -r requirements.txt
fi

echo "アプリ画面を開きます。閉じるとこのウィンドウも終了します。"
".venv/bin/python" main.py
