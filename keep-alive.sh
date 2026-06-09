#!/bin/bash
cd /home/z/my-project

while true; do
  if ! curl -s -o /dev/null -w "" http://localhost:3000/ 2>/dev/null; then
    echo "[$(date)] Server down, restarting..." >> /home/z/my-project/keep-alive.log
    pkill -f "next dev" 2>/dev/null
    sleep 2
    rm -rf .next
    nohup node node_modules/.bin/next dev -p 3000 -H 0.0.0.0 --webpack > dev.log 2>&1 &
    echo "[$(date)] Started PID: $!" >> /home/z/my-project/keep-alive.log
    # Wait for server to be ready
    for i in $(seq 1 30); do
      sleep 2
      if curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; then
        echo "[$(date)] Server ready!" >> /home/z/my-project/keep-alive.log
        break
      fi
    done
  fi
  sleep 10
done
