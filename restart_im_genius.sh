#!/bin/bash
pkill -f "server.py.*18787" 2>/dev/null
sleep 2
cd /opt/im-genius
nohup venv/bin/python server.py --port 18787 > /tmp/im-genius.log 2>&1 &
sleep 3
pgrep -f "server.py.*18787" && echo "OK restarted" || echo "FAIL"
curl -s http://127.0.0.1:18787/api/phase | head -1
