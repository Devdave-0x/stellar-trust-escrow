#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"

# 1️⃣ Fix linting & format staged files
echo "Running lint-staged..."
npx lint-staged

# 2️⃣ Run tests
echo "🏗 Running local CI build..."

# echo "🧪 Running tests..."
npm run test

# If any step fails, commit is aborted automatically
