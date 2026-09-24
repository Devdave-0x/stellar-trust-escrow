/**
 * Ratchet test: every event topic constant in the escrow contract's
 * `event_names.rs` must be documented in `docs/event-schema.md`.
 *
 * Topics that were already undocumented when this test was added are listed
 * in KNOWN_UNDOCUMENTED. The list may only shrink: a new undocumented topic
 * fails, and so does a listed topic that has since been documented (remove it
 * from the list). See docs/contract-event-checklist.md.
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EVENT_NAMES_PATH = resolve(ROOT, 'contracts/escrow_contract/src/event_names.rs');
const EVENT_SCHEMA_PATH = resolve(ROOT, 'docs/event-schema.md');

// Undocumented when this test was introduced (#631). Document them and delete
// the entries; never add to this list.
const KNOWN_UNDOCUMENTED = new Set([
  'esc_fund',
  'esc_spl',
  'esc_exp',
  'mil_tup',
  'mil_rej_r',
  'mil_cap',
  'rent_out',
  'fee_upd',
  'vest_crt',
  'dis_to',
  'can_apr',
  'can_done',
  'can_rej',
  'cl_role',
  'arb_upd',
  'dl_ext',
  'rent_col',
  'rent_exp',
  'nft_esc',
  'arb_asgn',
  'ev_sub',
  'esc_apr',
  'esc_rev',
  'esc_thr',
  'rel_pend',
  'rel_apr',
  'pend_rel',
  'fee_init',
  'esc_extd',
  'adm_init',
  'adm_prop',
  'adm_chg',
  'upgraded',
  'cd_done',
  'lim_upd',
  'arb_fee',
  'adm_trf',
  'adm_acc',
  'mile_crt',
  'esc_ctim',
  'adm_prp2',
  'adm_acc2',
  'adm_canc',
]);

/** Returns [{ name, symbol }] for every `pub const X: Symbol = symbol_short!("…")`. */
function readEventTopics() {
  const source = readFileSync(EVENT_NAMES_PATH, 'utf8');
  const pattern = /pub const (\w+): Symbol = symbol_short!\("([^"]+)"\)/g;
  return [...source.matchAll(pattern)].map(([, name, symbol]) => ({ name, symbol }));
}

function isDocumented(schema, symbol) {
  return schema.includes(`\`${symbol}\``);
}

describe('docs/event-schema.md covers event_names.rs', () => {
  const topics = readEventTopics();
  const schema = readFileSync(EVENT_SCHEMA_PATH, 'utf8');

  it('finds the event topic constants', () => {
    expect(topics.length).toBeGreaterThan(0);
  });

  it('documents every topic that is not on the known-gaps list', () => {
    const undocumented = topics
      .filter(({ symbol }) => !KNOWN_UNDOCUMENTED.has(symbol) && !isDocumented(schema, symbol))
      .map(({ name, symbol }) => `${name} (${symbol})`);

    expect(undocumented).toEqual([]);
  });

  it('keeps the known-gaps list free of topics that are now documented or removed', () => {
    const symbols = new Set(topics.map(({ symbol }) => symbol));
    const stale = [...KNOWN_UNDOCUMENTED].filter(
      (symbol) => !symbols.has(symbol) || isDocumented(schema, symbol),
    );

    expect(stale).toEqual([]);
  });
});
