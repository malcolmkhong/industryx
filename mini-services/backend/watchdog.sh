#!/bin/bash
cd /home/z/my-project/mini-services/backend
while true; do
  echo "[$(date)] Starting next dev..."
  ./node_modules/.bin/next dev -p 3001 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Process exited with code $EXIT_CODE, restarting in 3 seconds..."
  sleep 3
done
