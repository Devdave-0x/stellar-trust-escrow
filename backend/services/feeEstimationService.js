/**
 * Fee Estimation Service
 *
 * Computes platform + network fee estimates for an escrow transaction.
 *
 * Null/undefined handling convention: this module standardizes on
 * `value == null` (loose equality) to test for "missing" in one shot,
 * since it matches both `null` and `undefined` without excluding valid
 * falsy values like `0`. Do not use `===`/`!==` against `undefined`
 * alone, and do not rely on truthy checks (`if (!value)`), since both
 * of those previously misclassified a legitimate `amount: 0` as missing.
 *
 * @module feeEstimationService
 */

const DEFAULT_PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? 1.5);
const DEFAULT_NETWORK_FEE_STROOPS = 100;

/**
 * @param {number|string|null|undefined} amount - escrow principal
 * @param {object} [options]
 * @param {number} [options.platformFeePercent] - override platform fee %
 * @param {number} [options.networkFeeStroops] - override flat network fee
 * @param {number} [options.discountPercent] - optional promo discount %
 * @returns {{ amount: number, platformFee: number, networkFee: number, discount: number, total: number }}
 */
const estimateFee = (amount, options) => {
  if (amount == null) {
    throw new Error('estimateFee: amount is required');
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    throw new Error('estimateFee: amount must be a non-negative number');
  }

  const opts = options == null ? {} : options;

  const platformFeePercent =
    opts.platformFeePercent == null ? DEFAULT_PLATFORM_FEE_PERCENT : Number(opts.platformFeePercent);
  const networkFeeStroops =
    opts.networkFeeStroops == null ? DEFAULT_NETWORK_FEE_STROOPS : Number(opts.networkFeeStroops);
  const discountPercent = opts.discountPercent == null ? 0 : Number(opts.discountPercent);

  const platformFee = (numericAmount * platformFeePercent) / 100;
  const networkFee = networkFeeStroops / 10_000_000;
  const discount = discountPercent === 0 ? 0 : ((platformFee + networkFee) * discountPercent) / 100;
  const total = numericAmount + platformFee + networkFee - discount;

  return {
    amount: numericAmount,
    platformFee,
    networkFee,
    discount,
    total,
  };
};

/**
 * Resolves an effective fee percent, honoring an explicit tenant override
 * of `0` (a valid "fee waived" configuration) rather than falling back to
 * the default whenever the value is falsy.
 *
 * @param {number|null|undefined} tenantOverridePercent
 * @returns {number}
 */
const resolveFeePercent = (tenantOverridePercent) => {
  return tenantOverridePercent == null ? DEFAULT_PLATFORM_FEE_PERCENT : Number(tenantOverridePercent);
};

export { estimateFee, resolveFeePercent, DEFAULT_PLATFORM_FEE_PERCENT, DEFAULT_NETWORK_FEE_STROOPS };

export default { estimateFee, resolveFeePercent, DEFAULT_PLATFORM_FEE_PERCENT, DEFAULT_NETWORK_FEE_STROOPS };
