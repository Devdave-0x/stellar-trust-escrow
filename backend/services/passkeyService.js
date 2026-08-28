/**
 * Begin passkey registration for a user.
 *
 * @param {string} userId
 * @returns {Promise<never>}
 */
export async function beginPasskeyRegistration(userId) {
  throw new Error(`Passkey registration is not implemented for user ${userId}`);
}

/**
 * Finish passkey registration after the authenticator responds.
 *
 * @param {string} userId
 * @param {object} response
 * @returns {Promise<never>}
 */
export async function finishPasskeyRegistration(userId, response) {
  throw new Error(
    `Passkey registration completion is not implemented for user ${userId}: ${Boolean(response)}`,
  );
}

/**
 * Begin passkey authentication for a user.
 *
 * @param {string} userId
 * @returns {Promise<never>}
 */
export async function beginPasskeyAuthentication(userId) {
  throw new Error(`Passkey authentication is not implemented for user ${userId}`);
}

/**
 * Finish passkey authentication after the authenticator responds.
 *
 * @param {string} userId
 * @param {object} response
 * @returns {Promise<never>}
 */
export async function finishPasskeyAuthentication(userId, response) {
  throw new Error(
    `Passkey authentication completion is not implemented for user ${userId}: ${Boolean(response)}`,
  );
}

export default {
  beginPasskeyRegistration,
  finishPasskeyRegistration,
  beginPasskeyAuthentication,
  finishPasskeyAuthentication,
};
