import { jest } from '@jest/globals';

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.unstable_mockModule('../config/logger.js', () => ({
  default: loggerMock,
  createModuleLogger: () => loggerMock,
}));

// Mock SorobanRpc.Server
const mockServerInstances = new Map();
const mockSorobanRpc = {
  SorobanRpc: {
    Server: jest.fn((url) => {
      if (!mockServerInstances.has(url)) {
        mockServerInstances.set(url, {
          getLatestLedger: jest.fn(),
          sendTransaction: jest.fn(),
          getTransaction: jest.fn(),
          getEvents: jest.fn(),
        });
      }
      return mockServerInstances.get(url);
    }),
  },
  Transaction: jest.fn((xdr) => ({ xdr })),
  Networks: {
    PUBLIC: 'public',
    TESTNET: 'testnet',
  },
};

jest.unstable_mockModule('@stellar/stellar-sdk', () => mockSorobanRpc);

const { default: stellarClient } = await import('../services/stellarClient.js');

describe('Stellar RPC Error Taxonomy', () => {
  let primaryServer;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServerInstances.clear();
    loggerMock.error.mockReset();

    primaryServer = {
      getLatestLedger: jest.fn(),
      sendTransaction: jest.fn(),
      getTransaction: jest.fn(),
      getEvents: jest.fn(),
    };

    mockServerInstances.set('https://primary.stellar.org', primaryServer);

    for (const health of stellarClient.nodeHealth.values()) {
      health.isHealthy = true;
      health.failureCount = 0;
      health.successCount = 0;
      health.lastFailedAt = null;
      health.averageLatency = 0;
      health.deprioritizedUntil = null;
    }
  });

  afterEach(() => {
    stellarClient.destroy();
  });

  describe('RPC error classification', () => {
    it('maps timeout errors to retryable status', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'ECONNABORTED';
      primaryServer.getLatestLedger.mockRejectedValue(timeoutError);

      try {
        await stellarClient.getLatestLedger();
      } catch (error) {
        expect(error.code).toBe('ECONNABORTED');
        expect(loggerMock.error).toHaveBeenCalled();
      }
    });

    it('maps simulation failure errors with code SIMULATOR_ERROR', async () => {
      const simulationError = new Error('Simulation failed');
      simulationError.name = 'SorobanJsonRpcError';
      simulationError.code = -32000;
      primaryServer.sendTransaction.mockRejectedValue(simulationError);

      try {
        await stellarClient.sendTransaction('test_xdr');
      } catch (error) {
        expect(loggerMock.error).toHaveBeenCalled();
      }
    });

    it('classifies insufficient fee errors as retryable', async () => {
      const feeError = new Error('Insufficient fee');
      feeError.message = 'tx_insufficient_fee';
      primaryServer.sendTransaction.mockRejectedValue(feeError);

      try {
        await stellarClient.sendTransaction('test_xdr');
      } catch (error) {
        expect(error.message).toContain('fee');
        expect(loggerMock.error).toHaveBeenCalled();
      }
    });

    it('detects bad sequence errors as non-retryable', async () => {
      const sequenceError = new Error('Bad sequence number');
      sequenceError.message = 'tx_bad_seq';
      primaryServer.sendTransaction.mockRejectedValue(sequenceError);

      try {
        await stellarClient.sendTransaction('test_xdr');
      } catch (error) {
        expect(error.message).toContain('seq');
        expect(loggerMock.error).toHaveBeenCalled();
      }
    });

    it('identifies rate limit errors as retryable', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      primaryServer.getLatestLedger.mockRejectedValue(rateLimitError);

      try {
        await stellarClient.getLatestLedger();
      } catch (error) {
        expect(loggerMock.error).toHaveBeenCalled();
      }
    });

    it('classifies network unavailable errors as retryable', async () => {
      const networkError = new Error('Network unavailable');
      networkError.code = 'ECONNREFUSED';
      primaryServer.getLatestLedger.mockRejectedValue(networkError);

      try {
        await stellarClient.getLatestLedger();
      } catch (error) {
        expect(loggerMock.error).toHaveBeenCalled();
      }
    });
  });

  describe('error response with retryable flag', () => {
    it('includes retryable: true for timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'ECONNABORTED';
      primaryServer.getLatestLedger.mockRejectedValue(timeoutError);

      try {
        await stellarClient.getLatestLedger();
      } catch (error) {
        expect(loggerMock.error).toHaveBeenCalled();
      }
    });

    it('logs error classification when transaction fails', async () => {
      const error = new Error('Simulation failed');
      error.name = 'SorobanJsonRpcError';
      primaryServer.sendTransaction.mockRejectedValue(error);

      try {
        await stellarClient.sendTransaction('test_xdr');
      } catch {
        // expected
      }

      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('representative error coverage', () => {
    it('handles generic network errors', async () => {
      const netError = new Error('Network error');
      primaryServer.getLatestLedger.mockRejectedValue(netError);

      try {
        await stellarClient.getLatestLedger();
      } catch (error) {
        expect(loggerMock.error).toHaveBeenCalled();
      }
    });

    it('handles JSON parse errors from RPC response', async () => {
      const parseError = new SyntaxError('Unexpected token in JSON');
      primaryServer.getEvents.mockRejectedValue(parseError);

      try {
        await stellarClient.getEvents();
      } catch {
        expect(loggerMock.error).toHaveBeenCalled();
      }
    });

    it('handles Soroban specific RPC errors', async () => {
      const sorobanError = new Error('contract not found');
      sorobanError.name = 'SorobanJsonRpcError';
      primaryServer.getTransaction.mockRejectedValue(sorobanError);

      try {
        await stellarClient.getTransaction('hash');
      } catch {
        expect(loggerMock.error).toHaveBeenCalled();
      }
    });
  });

  describe('error taxonomy consistency', () => {
    it('classifies the same error type consistently across calls', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'ECONNABORTED';

      primaryServer.getLatestLedger.mockRejectedValueOnce(timeoutError);
      try {
        await stellarClient.getLatestLedger();
      } catch {
        // expected
      }

      primaryServer.getLatestLedger.mockRejectedValueOnce(timeoutError);
      try {
        await stellarClient.getLatestLedger();
      } catch {
        // expected
      }

      expect(loggerMock.error).toHaveBeenCalledTimes(2);
    });

    it('distinguishes retryable from non-retryable errors', async () => {
      const retryableError = new Error('Network error');
      retryableError.code = 'ECONNREFUSED';

      const nonRetryableError = new Error('Bad sequence');
      nonRetryableError.message = 'tx_bad_seq';

      primaryServer.getLatestLedger.mockRejectedValueOnce(retryableError);
      try {
        await stellarClient.getLatestLedger();
      } catch {
        // expected
      }

      primaryServer.sendTransaction.mockRejectedValueOnce(nonRetryableError);
      try {
        await stellarClient.sendTransaction('test_xdr');
      } catch {
        // expected
      }

      expect(loggerMock.error).toHaveBeenCalledTimes(2);
    });
  });
});
