@echo off
setlocal

cd /d "%~dp0"
set LOG_FILE=%CD%\launch.log

echo ---- %DATE% %TIME% Start Shortcut Mapper.bat launch ---->>"%LOG_FILE%"
echo Shortcut Mapper を起動しています...

if not exist ".venv\Scripts\python.exe" (
  echo 初回セットアップ: Python環境を作成します。
  py -3 -m venv .venv
  if errorlevel 1 (
    echo Python環境の作成に失敗しました。>>"%LOG_FILE%"
    pause
    exit /b 1
  )
)

".venv\Scripts\python.exe" -c "import webview, pynput, serial, hid" >nul 2>nul
if errorlevel 1 (
  echo 初回セットアップ: 必要なライブラリをインストールします。
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo ライブラリのインストールに失敗しました。>>"%LOG_FILE%"
    pause
    exit /b 1
  )
)

echo アプリ画面を開きます。
".venv\Scripts\python.exe" main.py
