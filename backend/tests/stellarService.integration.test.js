import { describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  Networks: {
    PUBLIC: 'PUBLIC',
    TESTNET: 'TESTNET',
  },
  Transaction: jest.fn().mockImplementation((xdr, networkPassphrase) => ({
    xdr,
    networkPassphrase,
  })),
  SorobanRpc: {
    Server: jest.fn().mockImplementation(() => ({
      sendTransaction: jest.fn().mockResolvedValue({
        hash: 'tx-hash',
        status: 'PENDING',
      }),
      getTransaction: jest.fn()
        .mockResolvedValueOnce({ status: 'SUCCESS', resultXdr: 'result-xdr' })
        .mockResolvedValueOnce({ events: [] })
        .mockResolvedValueOnce({ sequence: 12345 }),
      getEvents: jest.fn().mockResolvedValue({ events: [] }),
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 12345 }),
    })),
  },
}));

jest.unstable_mockModule('../lib/tracing.js', () => ({
  withSpan: async (_name, _attrs, fn) =>
    fn({
      setAttribute() {},
    }),
}));

const { submitTransaction, getContractEvents, getLatestLedger } = await import(
  '../services/stellarService.js'
);

describe('stellarService integration flow', () => {
  it('exercises submit, events, and latest ledger with mocked SDK calls', async () => {
    const submit = await submitTransaction('signed-xdr');
    expect(submit.status).toBe('SUCCESS');

    const events = await getContractEvents(1, 'contract-id');
    expect(events).toEqual([]);

    await expect(getLatestLedger()).resolves.toBe(12345);
  });
});
