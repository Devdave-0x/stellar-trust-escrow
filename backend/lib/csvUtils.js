/**
 * csvUtils.js
 *
 * Thin utility wrapper around csv-stringify for the escrow CSV export.
 * Extracted from escrowController so it can be tested independently.
 *
 * Exports:
 *   CSV_EXPORT_COLUMNS  — ordered list of column names used for the header row
 *   buildEscrowCsvRow   — maps a raw Prisma escrow record + caller address to a
 *                         plain object shaped for csv-stringify
 *   serializeEscrowsToCsv — synchronously serializes an array of row objects to
 *                           a complete CSV string (header + data rows)
 */

import { stringify } from 'csv-stringify/sync';

/**
 * Column names used for the escrow CSV export.
 * The order here determines the column order in the output file.
 */
export const CSV_EXPORT_COLUMNS = [
  'id',
  'title',
  'amount',
  'currency',
  'status',
  'counterparty',
  'created_at',
  'completed_at',
];

/**
 * Maps a raw Prisma escrow row to a plain object keyed by CSV_EXPORT_COLUMNS.
 *
 * Column mapping (no dedicated title/currency/completedAt fields in the schema):
 *   title        ← briefHash  (closest existing description reference)
 *   currency     ← tokenAddress (the Soroban token the amount is denominated in)
 *   completed_at ← updatedAt when status === 'Completed', otherwise ''
 *   counterparty ← the address of the *other* party relative to callerAddress
 *
 * @param {object} escrow        - Prisma escrow record
 * @param {string} callerAddress - Stellar address of the authenticated user
 * @returns {object}             - Plain object with CSV_EXPORT_COLUMNS keys
 */
export function buildEscrowCsvRow(escrow, callerAddress) {
  return {
    id: escrow.id.toString(),
    title: escrow.briefHash || '',
    amount: escrow.totalAmount,
    currency: escrow.tokenAddress,
    status: escrow.status,
    counterparty:
      escrow.clientAddress === callerAddress
        ? escrow.freelancerAddress
        : escrow.clientAddress,
    created_at:
      escrow.createdAt instanceof Date
        ? escrow.createdAt.toISOString()
        : escrow.createdAt || '',
    completed_at:
      escrow.status === 'Completed'
        ? escrow.updatedAt instanceof Date
          ? escrow.updatedAt.toISOString()
          : escrow.updatedAt || ''
        : '',
  };
}

/**
 * Synchronously serializes an array of row objects to a complete CSV string.
 *
 * The first row is always the header (CSV_EXPORT_COLUMNS).
 * An empty `rows` array produces a headers-only CSV (no data rows).
 *
 * Special characters — commas, double-quotes, newlines — in field values are
 * handled automatically by csv-stringify per RFC 4180: fields are quoted and
 * internal quotes are doubled.
 *
 * @param {object[]} rows  - Array of objects produced by buildEscrowCsvRow
 * @returns {string}        - Complete CSV string including the trailing newline
 */
export function serializeEscrowsToCsv(rows) {
  return stringify(rows, {
    header: true,
    columns: CSV_EXPORT_COLUMNS,
  });
}
