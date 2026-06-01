#!/bin/bash
# ============================================================
#  NOVA LANCE — Burning Skies   launcher (macOS / Linux)
#  Double-click this file (macOS) to start a local server and
#  open the game in your default browser. Also prints the LAN
#  address so phones/tablets on the same Wi-Fi can join.
# ============================================================
cd "$(dirname "$0")" || exit 1

PORT=8080

# pick a launcher: node server if available, else python3
start_server() {
  if command -v node >/dev/null 2>&1; then
    node tools/serve.js "$PORT"
  elif command -v python3 >/dev/null 2>&1; then
    echo "NOVA LANCE serving at http://localhost:$PORT/"
    python3 -m http.server "$PORT"
  else
    echo "Need Node.js or Python 3 to run the local server." >&2
    echo "Alternatively just double-click index.html (file:// mode works too)." >&2
    read -r -p "Press Enter to exit..."
    exit 1
  fi
}

# best-effort LAN IP for phones on the same Wi-Fi
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')

echo "============================================================"
echo "  NOVA LANCE — Burning Skies"
echo "  PC      :  http://localhost:$PORT/"
[ -n "$LAN_IP" ] && echo "  Phone   :  http://$LAN_IP:$PORT/   (same Wi-Fi, hold phone sideways)"
echo "  Stop    :  press Ctrl+C in this window"
echo "============================================================"

# open the browser shortly after the server comes up
( sleep 1
  URL="http://localhost:$PORT/"
  if command -v open >/dev/null 2>&1; then open "$URL"          # macOS
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" # Linux
  fi
) &

start_server
