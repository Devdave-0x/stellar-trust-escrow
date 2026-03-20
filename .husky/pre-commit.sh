#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"

echo "💅 Fixing lint & formatting staged files..."
npm run lint-staged
npm run format

# npm run lint-staged || {
#   echo "❌ Lint-staged failed!"
#   exit 1
# }

echo "💅 Building all files..."
npm run build

# npm run build || {
#   echo "❌ Lint-staged failed!"
#   exit 1
# }

echo "🧪 Running all tests before commit..."
npm run test
# npm run test || {
#   echo "❌ Tests failed! Commit aborted."
#   exit 1
# }

echo "✅ Pre-commit checks passed."
