#!/bin/bash

# Index the sample codebase

cd "$(dirname "$0")/.."

SAMPLE_CODE_PATH="$(pwd)/sample_code"

echo "📚 Indexing sample codebase at: $SAMPLE_CODE_PATH"

curl -X POST http://localhost:8000/api/index \
  -H "Content-Type: application/json" \
  -d "{\"directory_path\": \"$SAMPLE_CODE_PATH\"}"

echo ""
echo "✅ Indexing complete! Try searching in the UI."
