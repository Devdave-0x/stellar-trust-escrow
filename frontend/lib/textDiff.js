/**
 * textDiff
 *
 * Minimal, dependency-free word/line diff (Myers-style LCS) used to power
 * the contract terms visual diff in the dispute flow. Kept dependency-free
 * on purpose — avoids pulling in a diff package for a single use case.
 */

function tokenizeWords(text) {
  return (text ?? '').match(/\s+|[^\s]+/g) ?? [];
}

function tokenizeLines(text) {
  return (text ?? '').split('\n');
}

function lcsDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: 'equal', value: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'removed', value: a[i] });
      i++;
    } else {
      result.push({ type: 'added', value: b[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: 'removed', value: a[i] });
    i++;
  }
  while (j < m) {
    result.push({ type: 'added', value: b[j] });
    j++;
  }

  return mergeConsecutive(result);
}

function mergeConsecutive(parts) {
  const merged = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last && last.type === part.type) {
      last.value += part.value;
    } else {
      merged.push({ ...part });
    }
  }
  return merged;
}

/** Word-level diff. Returns [{ type: 'equal'|'added'|'removed', value }] */
export function diffWords(oldText, newText) {
  return lcsDiff(tokenizeWords(oldText), tokenizeWords(newText));
}

/** Line-level diff. Returns [{ type: 'equal'|'added'|'removed', value }] */
export function diffLines(oldText, newText) {
  return lcsDiff(tokenizeLines(oldText), tokenizeLines(newText));
}
