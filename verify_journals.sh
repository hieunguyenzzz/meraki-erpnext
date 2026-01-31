#!/bin/bash

submitted=0
draft=0
cancelled=0

for i in {1..18}; do
  JV_NUM=$(printf "%05d" $i)
  JV_NAME="ACC-JV-2026-$JV_NUM"

  STATUS=$(curl -s "http://100.65.0.28:8082/api/resource/Journal%20Entry/$JV_NAME" \
    -H 'Authorization: token 3bbfdde5c04cf80:64118609e403a46' | jq -r '.data.docstatus')

  case $STATUS in
    0) draft=$((draft + 1)); echo "$JV_NAME: Draft" ;;
    1) submitted=$((submitted + 1)); echo "$JV_NAME: Submitted" ;;
    2) cancelled=$((cancelled + 1)); echo "$JV_NAME: Cancelled" ;;
    *) echo "$JV_NAME: Unknown ($STATUS)" ;;
  esac
done

echo ""
echo "Summary:"
echo "  Submitted: $submitted"
echo "  Draft: $draft"
echo "  Cancelled: $cancelled"
