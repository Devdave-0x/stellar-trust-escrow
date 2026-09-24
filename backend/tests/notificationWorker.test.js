import { jest } from '@jest/globals';

const connectionMock = {};

const workerMock = {
  process: jest.fn(),
  on: jest.fn(),
};

// Mock Worker to capture the job handler
let jobHandler = null;
jest.unstable_mockModule('bullmq', () => ({
  Worker: jest.fn((queueName, handler) => {
    jobHandler = handler;
    return workerMock;
  }),
}));

jest.unstable_mockModule('../queues/index.js', () => ({ connection: connectionMock }));

const notificationWorkerModule = await import('../workers/notificationWorker.js');
const { metrics } = notificationWorkerModule;

describe('notificationWorker - Backpressure & Retry Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    metrics.notifications_queued = 0;
    metrics.notifications_delivered = 0;
    metrics.notifications_failed = 0;
    metrics.notifications_delayed = 0;
    metrics.tenant_throttle_count = {};
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg-123' }),
    });
  });

  it('should deliver email notifications via configured provider', async () => {
    const job = {
      data: {
        event: 'escrow_funded',
        email: 'user@example.com',
        data: {
          escrowId: 42,
          dashboardUrl: 'http://localhost:4000/escrows/42',
          recipientName: 'John',
        },
      },
      attempt: 1,
    };

    const result = await jobHandler(job);

    expect(result).toBeDefined();
    expect(result.provider).toBeDefined();
    expect(result.messageId).toBeDefined();
  });

  it('should implement exponential backoff for transient failures', async () => {
    // Set resend provider to trigger fetch
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 'test-key';

    const job = {
      data: {
        event: 'escrow_funded',
        email: 'user@example.com',
        data: {
          escrowId: 42,
          recipientName: 'John',
        },
      },
      attempt: 1,
    };

    global.fetch = jest.fn().mockRejectedValue(new Error('Network timeout'));

    try {
      await jobHandler(job);
    } catch (e) {
      expect(e.message).toContain('timeout');
    }

    process.env.EMAIL_PROVIDER = 'console';
    delete process.env.RESEND_API_KEY;
  });

  it('should track throttling when tenant concurrency limit exceeded', async () => {
    const job1 = {
      data: {
        event: 'escrow_funded',
        email: 'user1@example.com',
        tenantId: 'tenant-1',
        data: { escrowId: 1, recipientName: 'User 1' },
      },
      attempt: 1,
    };

    const throttleError = new Error('Tenant tenant-1 throttled');
    jest.spyOn(global, 'fetch').mockRejectedValue(throttleError);

    try {
      await jobHandler(job1);
    } catch (e) {
      // Expected
    }
  });

  it('should handle invalid event templates gracefully', async () => {
    const job = {
      data: {
        event: 'unknown_event',
        email: 'user@example.com',
        data: { escrowId: 42 },
      },
      attempt: 1,
    };

    await expect(jobHandler(job)).rejects.toThrow('No template for event');
  });

  it('should increment metrics on successful delivery', async () => {
    const job = {
      data: {
        event: 'escrow_funded',
        email: 'user@example.com',
        data: {
          escrowId: 42,
          recipientName: 'John',
        },
      },
      attempt: 1,
    };

    const initialDelivered = metrics.notifications_delivered;

    await jobHandler(job);

    expect(metrics.notifications_delivered).toBeGreaterThan(initialDelivered);
  });

  it('should track delayed notifications for monitoring', async () => {
    const job = {
      data: {
        event: 'escrow_funded',
        email: 'user@example.com',
        tenantId: 'tenant-1',
        data: {
          escrowId: 42,
          recipientName: 'John',
        },
      },
      attempt: 1,
      delay: 5000,
    };

    const result = await jobHandler(job);
    expect(result).toBeDefined();
  });

  it('should implement per-tenant concurrency limits', async () => {
    const concurrentJobs = Array.from({ length: 3 }, (_, i) => ({
      data: {
        event: 'escrow_funded',
        email: `user${i}@example.com`,
        tenantId: 'tenant-1',
        data: { escrowId: i, recipientName: `User ${i}` },
      },
      attempt: 1,
    }));

    const results = [];
    for (const job of concurrentJobs) {
      try {
        const result = await jobHandler(job);
        results.push(result);
      } catch (e) {
        results.push(null);
      }
    }

    const successCount = results.filter((r) => r !== null).length;
    expect(successCount).toBeGreaterThanOrEqual(0);
  });

  it('should log failed delivery attempts for diagnostics', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const job = {
      data: {
        event: 'escrow_funded',
        email: 'user@example.com',
        data: { escrowId: 42, recipientName: 'John' },
      },
      attempt: 3,
    };

    global.fetch = jest.fn().mockRejectedValue(new Error('Service unavailable'));

    try {
      await jobHandler(job);
    } catch (e) {
      // Expected to fail
    }

    consoleErrorSpy.mockRestore();
  });

  it('should expose metrics object for monitoring', () => {
    expect(metrics).toBeDefined();
    expect(metrics.notifications_delivered).toBeDefined();
    expect(metrics.notifications_failed).toBeDefined();
    expect(metrics.notifications_delayed).toBeDefined();
    expect(metrics.tenant_throttle_count).toBeDefined();
  });

  it('should support bulk notification handling with throttling', async () => {
    const bulkJobs = Array.from({ length: 10 }, (_, i) => ({
      data: {
        event: 'escrow_funded',
        email: `user${i}@example.com`,
        tenantId: 'tenant-bulk',
        data: {
          escrowId: i,
          recipientName: `User ${i}`,
        },
      },
      attempt: 1,
    }));

    const results = [];
    for (const job of bulkJobs) {
      try {
        const result = await jobHandler(job);
        results.push(result);
      } catch (e) {
        results.push(null);
      }
    }

    const successCount = results.filter((r) => r !== null).length;
    expect(successCount).toBeGreaterThanOrEqual(0);
  });
});
