import { ERROR_CODES, parseError } from '../../lib/api/errorParser';

describe('response-envelope error contract', () => {
  test.each([
    [400, { error: 'Invalid amount', code: 'INVALID_AMOUNT', details: [{ field: 'amount' }] }, 'Invalid amount', 'INVALID_AMOUNT'],
    [401, { error: { message: 'Session expired', code: 'AUTH_EXPIRED' } }, 'Session expired', 'AUTH_EXPIRED'],
    [429, { error: 'Slow down' }, 'Slow down', ERROR_CODES.RATE_LIMITED],
    [500, { error: 'Database unavailable' }, 'Database unavailable', ERROR_CODES.SERVER_ERROR],
  ])('normalizes status %s', (status, data, message, code) => {
    expect(parseError({ response: { status, data } })).toEqual(
      expect.objectContaining({ status, message, code }),
    );
  });

  it('keeps validation details stable', () => {
    const details = [{ field: 'amount', message: 'Must be positive' }];
    expect(parseError({ response: { status: 422, data: { code: 'VALIDATION', details } } }).details)
      .toEqual(details);
  });
});
