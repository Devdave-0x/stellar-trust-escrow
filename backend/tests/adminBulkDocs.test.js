/**
 * Drift test: the transition table in docs/admin-bulk-actions.md must match
 * the escrow status state machine enforced by the bulk-status endpoint.
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { ESCROW_STATUSES, isValidTransition } from '../lib/escrowTransitions.js';

const DOC_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/admin-bulk-actions.md',
);

/** Parses the drift-marked table into { from: [allowed targets] }. */
function readDocumentedTransitions() {
  const doc = readFileSync(DOC_PATH, 'utf8');
  const section = doc.match(
    /<!-- drift:escrow-transitions:start -->([\s\S]*?)<!-- drift:escrow-transitions:end -->/,
  );
  if (!section) throw new Error('drift markers not found in admin-bulk-actions.md');

  const table = {};
  for (const line of section[1].split('\n')) {
    const row = line.match(/^\|\s*`([A-Za-z]+)`\s*\|(.*)\|\s*$/);
    if (!row) continue;
    const [, from, targets] = row;
    table[from] = [...targets.matchAll(/`([A-Za-z]+)`/g)].map((match) => match[1]).sort();
  }
  return table;
}

/** Builds the same shape from the code by probing every status pair. */
function readCodeTransitions() {
  const table = {};
  for (const from of ESCROW_STATUSES) {
    table[from] = ESCROW_STATUSES.filter((to) => isValidTransition(from, to)).sort();
  }
  return table;
}

describe('docs/admin-bulk-actions.md drift', () => {
  it('documents every escrow status as a source row', () => {
    expect(Object.keys(readDocumentedTransitions()).sort()).toEqual([...ESCROW_STATUSES].sort());
  });

  it('documents exactly the transitions escrowTransitions.js allows', () => {
    expect(readDocumentedTransitions()).toEqual(readCodeTransitions());
  });
});
