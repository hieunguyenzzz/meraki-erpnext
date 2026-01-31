#!/bin/bash

for i in {1..18}; do
  JV_NUM=$(printf "%05d" $i)
  JV_NAME="ACC-JV-2026-$JV_NUM"
  echo "Submitting $JV_NAME..."

  curl -s -X PUT "http://100.65.0.28:8082/api/resource/Journal%20Entry/$JV_NAME" \
    -H 'Authorization: token 3bbfdde5c04cf80:64118609e403a46' \
    -H 'Content-Type: application/json' \
    -d '{"docstatus": 1}' > /dev/null

  if [ $? -eq 0 ]; then
    echo "  ✓ Submitted successfully"
  else
    echo "  ✗ Failed"
  fi

  sleep 0.3
done

echo ""
echo "Done! Verifying..."
curl -s 'http://100.65.0.28:8082/api/resource/Journal%20Entry?fields=["name","docstatus"]&limit_page_length=0' \
  -H 'Authorization: token 3bbfdde5c04cf80:64118609e403a46' | \
  jq -r '.data[] | select(.docstatus == 1) | .name' | wc -l | xargs echo "Submitted Journal Entries:"
