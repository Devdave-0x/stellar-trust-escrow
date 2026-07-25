/**
 * JSON.stringify (and therefore Express's res.json) throws on BigInt values
 * with no built-in serialization. Escrow IDs are BigInt throughout the
 * schema, so any handler that returns a raw Prisma row crashes. Importing
 * this module once at process start fixes that globally.
 */
if (typeof BigInt.prototype.toJSON !== 'function') {
  // eslint-disable-next-line no-extend-native
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };
}
