import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

const prismaMock = {
  contractEvent: { findFirst: jest.fn() },
  escrow: { findUnique: jest.fn() },
  stellarMonitorCursor: { findUnique: jest.fn(), upsert: jest.fn() },
  stellarMonitorDivergence: {
    upsert: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn(),
  },
};
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

jest.unstable_mockModule('../services/emailService.js', () => ({
  default: { sendEmail: jest.fn().mockResolvedValue(undefined) },
}));

// ── Horizon SSE mock ──────────────────────────────────────────────────────────

let capturedOnmessage = null;
let streamCloseFn = null;

const txBuilder = {
  forAccount: jest.fn().mockReturnThis(),
  cursor: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  call: jest.fn().mockResolvedValue({ records: [] }),
  stream: jest.fn(({ onmessage }) => {
    capturedOnmessage = onmessage;
    streamCloseFn = jest.fn();
    return streamCloseFn;
  }),
};

jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  Horizon: { Server: jest.fn(() => ({ transactions: jest.fn(() => txBuilder) })) },
}));

// ── fetch mock ────────────────────────────────────────────────────────────────

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  jest.clearAllMocks();
  capturedOnmessage = null;
  streamCloseFn = null;
  txBuilder.call.mockResolvedValue({ records: [] });
  txBuilder.stream.mockImplementation(({ onmessage }) => {
    capturedOnmessage = onmessage;
    streamCloseFn = jest.fn();
    return streamCloseFn;
  });
  // Default: no existing DB records
  prismaMock.contractEvent.findFirst.mockResolvedValue(null);
  prismaMock.escrow.findUnique.mockResolvedValue(null);
  prismaMock.stellarMonitorCursor.findUnique.mockResolvedValue(null);
  prismaMock.stellarMonitorCursor.upsert.mockResolvedValue({});
  prismaMock.stellarMonitorDivergence.upsert.mockResolvedValue({});
  prismaMock.stellarMonitorDivergence.findMany.mockResolvedValue([]);
  prismaMock.stellarMonitorDivergence.updateMany.mockResolvedValue({ count: 0 });
  Object.assign(txBuilder, {
    forAccount: jest.fn().mockReturnThis(),
    cursor: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeTx = (hash = 'tx1', memo = null, pt = 'pt1') => ({
  hash, paging_token: pt, memo, memo_type: memo ? 'text' : 'none',
});
const makeEscrowTx = (hash = 'etx1', escrowId = '1', type = 'fund', pt = 'pt1') =>
  makeTx(hash, `escrow:${escrowId}:${type}`, pt);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StellarMonitorService', () => {
  describe('reconcile()', () => {
    it('returns zeros when given no accounts', async () => {
      jest.resetModules();
      const { reconcile } = await import('../services/stellarMonitorService.js');
      expect(await reconcile([])).toEqual({ processed: 0, divergences: 0 });
    });

    it('counts irrelevant txs as processed without divergence', async () => {
      jest.resetModules();
      const { reconcile } = await import('../services/stellarMonitorService.js');
      txBuilder.call.mockResolvedValueOnce({ records: [makeTx('h1')] });
      const result = await reconcile(['GACC1']);
      expect(result).toEqual({ processed: 1, divergences: 0 });
      expect(prismaMock.stellarMonitorDivergence.upsert).not.toHaveBeenCalled();
    });

    it('records divergence for escrow tx missing from DB', async () => {
      jest.resetModules();
      const { reconcile } = await import('../services/stellarMonitorService.js');
      txBuilder.call.mockResolvedValueOnce({ records: [makeEscrowTx('missing')] });
      const result = await reconcile(['GACC2']);
      expect(result.divergences).toBe(1);
      expect(prismaMock.stellarMonitorDivergence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ txHash: 'missing' }) }),
      );
    });

    it('skips divergence when ContractEvent already exists for tx', async () => {
      jest.resetModules();
      prismaMock.contractEvent.findFirst.mockResolvedValueOnce({ id: 1 });
      const { reconcile } = await import('../services/stellarMonitorService.js');
      txBuilder.call.mockResolvedValueOnce({ records: [makeEscrowTx('known')] });
      const result = await reconcile(['GACC3']);
      expect(result.divergences).toBe(0);
      expect(prismaMock.stellarMonitorDivergence.upsert).not.toHaveBeenCalled();
    });

    it('handles Horizon errors gracefully without throwing', async () => {
      jest.resetModules();
      const { reconcile } = await import('../services/stellarMonitorService.js');
      txBuilder.call.mockRejectedValueOnce(new Error('network fail'));
      const result = await reconcile(['GACC_ERR']);
      expect(result.processed).toBe(0);
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'startup_reconcile_error' }),
      );
    });
  });

  describe('start() / stop()', () => {
    afterEach(() => {
      process.env.MONITOR_ACCOUNTS = '';
      jest.resetModules();
    });

    it('warns and returns early when MONITOR_ACCOUNTS is empty', async () => {
      process.env.MONITOR_ACCOUNTS = '';
      const monitor = await import('../services/stellarMonitorService.js');
      await monitor.start();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'monitor_no_accounts' }),
      );
    });

    it('opens one SSE stream per monitored account', async () => {
      process.env.MONITOR_ACCOUNTS = 'GACC4,GACC5';
      jest.resetModules();
      const monitor = await import('../services/stellarMonitorService.js');
      await monitor.start();
      expect(txBuilder.forAccount).toHaveBeenCalledWith('GACC4');
      expect(txBuilder.forAccount).toHaveBeenCalledWith('GACC5');
      monitor.stop();
    });

    it('stop() calls close() on all open streams', async () => {
      process.env.MONITOR_ACCOUNTS = 'GACC6';
      jest.resetModules();
      const monitor = await import('../services/stellarMonitorService.js');
      await monitor.start();
      await Promise.resolve(); // flush async startStream
      monitor.stop();
      expect(streamCloseFn).toHaveBeenCalled();
    });
  });

  describe('SSE stream processing', () => {
    afterEach(() => {
      process.env.MONITOR_ACCOUNTS = '';
      jest.resetModules();
    });

    it('persists cursor after each streaming tx', async () => {
      process.env.MONITOR_ACCOUNTS = 'GSTREAM1';
      jest.resetModules();
      const monitor = await import('../services/stellarMonitorService.js');
      await monitor.start();
      await Promise.resolve(); // flush async startStream so capturedOnmessage is set

      await capturedOnmessage(makeTx('stx1', null, 'cursor-42'));

      expect(prismaMock.stellarMonitorCursor.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ cursor: 'cursor-42' }) }),
      );
      monitor.stop();
    });

    it('records divergence for relevant streaming tx with no DB match', async () => {
      process.env.MONITOR_ACCOUNTS = 'GSTREAM2';
      jest.resetModules();
      const monitor = await import('../services/stellarMonitorService.js');
      await monitor.start();
      await Promise.resolve();

      await capturedOnmessage(makeEscrowTx('live-miss', '7'));

      expect(prismaMock.stellarMonitorDivergence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ txHash: 'live-miss' }) }),
      );
      monitor.stop();
    });
  });

  describe('divergence alerting', () => {
    afterEach(() => {
      jest.useRealTimers();
      process.env.SLACK_WEBHOOK_URL = '';
      process.env.MONITOR_ACCOUNTS = '';
      process.env.MONITOR_ALERT_WINDOW_MS = '300000';
      jest.resetModules();
    });

    it('sends Slack alert for old unresolved divergences', async () => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.MONITOR_ALERT_WINDOW_MS = '0';
      process.env.MONITOR_ACCOUNTS = 'GALERT';
      jest.resetModules();

      prismaMock.stellarMonitorDivergence.findMany.mockResolvedValueOnce([
        { id: 1, txHash: 'alert-tx', account: 'GALERT', eventType: 'fund' },
      ]);

      jest.useFakeTimers({ doNotFake: ['Promise', 'setImmediate', 'nextTick', 'queueMicrotask'] });
      const monitor = await import('../services/stellarMonitorService.js');
      await monitor.start();

      jest.advanceTimersByTime(61000);
      await new Promise((r) => setImmediate(r));

      const slackCall = global.fetch.mock.calls.find(
        ([url]) => url === 'https://hooks.slack.com/test',
      );
      expect(slackCall).toBeDefined();
      expect(JSON.parse(slackCall[1].body).text).toMatch(/divergence/i);

      monitor.stop();
    });

    it('marks alerted divergences so they are not re-fired', async () => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/refire';
      process.env.MONITOR_ALERT_WINDOW_MS = '0';
      process.env.MONITOR_ACCOUNTS = 'GREFIRE';
      jest.resetModules();

      // First check returns 1 pending divergence; second returns 0 (already alerted)
      prismaMock.stellarMonitorDivergence.findMany
        .mockResolvedValueOnce([{ id: 2, txHash: 'rf-tx', account: 'GREFIRE', eventType: 'release' }])
        .mockResolvedValueOnce([]);

      jest.useFakeTimers({ doNotFake: ['Promise', 'setImmediate', 'nextTick', 'queueMicrotask'] });
      const monitor = await import('../services/stellarMonitorService.js');
      await monitor.start();

      jest.advanceTimersByTime(61000);
      await new Promise((r) => setImmediate(r));

      expect(prismaMock.stellarMonitorDivergence.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ alertedAt: expect.any(Date) }) }),
      );

      const firstCount = global.fetch.mock.calls.filter(
        ([url]) => url === 'https://hooks.slack.com/refire',
      ).length;

      jest.advanceTimersByTime(61000);
      await new Promise((r) => setImmediate(r));

      const secondCount = global.fetch.mock.calls.filter(
        ([url]) => url === 'https://hooks.slack.com/refire',
      ).length;
      expect(secondCount).toBe(firstCount); // no new alerts

      monitor.stop();
    });
  });
});
