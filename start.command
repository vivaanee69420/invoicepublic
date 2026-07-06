#!/bin/bash
# Double-click this file on a Mac to start your dashboard.
# (If macOS blocks it the first time: right-click → Open, then confirm.)

cd "$(dirname "$0")" || exit 1

echo "🗂️  Starting My Planner…"
echo

# 1. Node.js must be installed.
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js isn't installed yet — it's the free engine this app runs on."
  echo "   Opening the download page. Install it, then double-click this file again."
  open "https://nodejs.org/en/download/prebuilt-installer"
  echo
  read -r -p "Press Return to close…" _
  exit 1
fi

# 2. Install dependencies on first run.
if [ ! -d node_modules ]; then
  echo "📦 First-time setup (installing components, ~30s)…"
  npm install --no-audit --no-fund || { echo "Setup failed."; read -r _; exit 1; }
  echo
fi

# 3. Owner password: read from owner-password.txt if present, else a default.
if [ -f owner-password.txt ]; then
  OWNER_PASSWORD="$(tr -d '\r\n' < owner-password.txt)"
else
  OWNER_PASSWORD="changeme"
  echo "ℹ️  Using the default password \"changeme\"."
  echo "   To set your own: create a file called owner-password.txt next to this"
  echo "   launcher containing just your password, then restart."
fi
export OWNER_PASSWORD
export PORT="${PORT:-3000}"

echo
echo "✅ Dashboard:   http://localhost:$PORT"
echo "✅ Staff portal: http://localhost:$PORT/staff.html"
echo "   Sign in with your owner password. Keep this window open while you use it;"
echo "   close it (or press Control-C) to stop the app."
echo

# Open the browser shortly after the server comes up.
( sleep 2; open "http://localhost:$PORT" ) &

node server.js
