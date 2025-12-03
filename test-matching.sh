#!/bin/bash

echo "=== Testing All Invoice Matching Scenarios ==="

for id in 27 28 29 30 31; do
  echo ""
  echo "--- Invoice ID: $id ---"
  curl -s -X POST "http://localhost:3001/api/invoices/$id/find-matching-pos" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(f\"Match Type: {data.get('matchType')}\")
    print(f\"Matched: {data.get('matched')}\")
    if data.get('matches') and len(data['matches']) > 0:
        match = data['matches'][0]
        print(f\"Best Match: {match['po']['code']} - Confidence: {match['confidence']:.1%}\")
        print(f\"Reasons: {', '.join(match['reasons'][:2])}\")
    else:
        print('No matches found')
except Exception as e:
    print(f'Error: {e}')
"
done

echo ""
echo "=== Test Complete ==="
