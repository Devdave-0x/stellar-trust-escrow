#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"

# 1️⃣ Validate branch name
branch_name=$(git symbolic-ref --short HEAD)

echo "🔖 Validating branch name..."
npx validate-branch-name || {
  echo "❌ Invalid branch name. Push aborted."
  exit 1
}

echo "💅 Fixing lint & formatting staged files before push..."
npx lint-staged || {
  echo "❌ Lint-staged failed!"
  exit 1
}

echo "🧪 Running all tests before push..."
npm run test || {
  echo "❌ Tests failed! Push aborted."
  exit 1
}

pattern="^(main|develop|live){1}$|^(feature|fix|refactor|hotfix|release|conflict)/NV-[0-9]{1,5}.*$"
if ! echo "$branch_name" | grep -Eq "$pattern"; then
  echo "❌ Invalid branch name: $branch_name"
  echo "Allowed: main, develop, live OR feature/fix/refactor/hotfix/release/conflict/NV-1234-description"
  exit 1
fi

protected_branch='refs/heads/main'
current_user=$(git config user.email)
allowed_user='ilorahdavid126@gmail.com'
z40=0000000000000000000000000000000000000000

while read local_ref local_sha remote_ref remote_sha
do
    if [ "$remote_ref" = "$protected_branch" ]; then

        if [ "$current_user" != "$allowed_user" ]; then
            echo "❌ Only $allowed_user can push to main."
            exit 1
        fi

        if [ "$local_sha" = "$z40" ]; then
            echo "❌ Deleting main is restricted."
            exit 1
        fi

        if ! git merge-base --is-ancestor "$remote_sha" "$local_sha"; then
            echo "❌ Force push to main is restricted."
            exit 1
        fi
    fi
done

npx lint-staged

echo "✅ Pre-push checks passed."

exit 0


