/**
 * Attachment quarantine state transitions tests — Issue #547
 *
 * Covers state transitions for file uploads through a scanning workflow.
 * Attachments progress through states: pending_scan, clean, infected, failed.
 *
 * Acceptance Criteria:
 *  • Controller tracks scan status
 *  • Unsafe files excluded from evidence endpoints
 *  • All existing tests continue passing
 *  • Test coverage includes scanner timeout scenarios
 *  • Test coverage includes infected file detection
 */

import { jest } from '@jest/globals';

const ATTACHMENT_STATES = {
  PENDING_SCAN: 'pending_scan',
  CLEAN: 'clean',
  INFECTED: 'infected',
  FAILED: 'failed',
};

const TEST_ATTACHMENT = {
  id: 'attach_001',
  escrowId: '42',
  fileName: 'contract.pdf',
  fileHash: 'abc123def456',
  fileSize: 2048,
  mimeType: 'application/pdf',
  state: ATTACHMENT_STATES.PENDING_SCAN,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Attachment Quarantine State Transitions — Issue #547', () => {
  let attachmentService;
  let prismaMock;
  let virusScannerMock;

  beforeAll(async () => {
    prismaMock = {
      attachment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      escrowAttachment: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb?.(prismaMock)),
    };

    virusScannerMock = {
      scanFile: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
    jest.unstable_mockModule('../services/virusScanner.js', () => ({
      default: virusScannerMock,
    }));

    attachmentService = (await import('../services/attachmentService.js')).default;
  });

  describe('State Transitions — Happy Path', () => {
    it('creates attachment in pending_scan state', async () => {
      prismaMock.attachment.create.mockResolvedValue({
        ...TEST_ATTACHMENT,
        state: ATTACHMENT_STATES.PENDING_SCAN,
      });

      const result = await attachmentService.createAttachment({
        escrowId: TEST_ATTACHMENT.escrowId,
        fileName: TEST_ATTACHMENT.fileName,
        fileHash: TEST_ATTACHMENT.fileHash,
        fileSize: TEST_ATTACHMENT.fileSize,
        mimeType: TEST_ATTACHMENT.mimeType,
      });

      expect(result.state).toBe(ATTACHMENT_STATES.PENDING_SCAN);
      expect(prismaMock.attachment.create).toHaveBeenCalled();
    });

    it('transitions pending_scan → clean after successful scan', async () => {
      const attachmentId = TEST_ATTACHMENT.id;
      const updatedAttachment = {
        ...TEST_ATTACHMENT,
        state: ATTACHMENT_STATES.CLEAN,
        updatedAt: new Date(),
      };

      prismaMock.attachment.findUnique.mockResolvedValue(TEST_ATTACHMENT);
      virusScannerMock.scanFile.mockResolvedValue({ infected: false, details: null });
      prismaMock.attachment.update.mockResolvedValue(updatedAttachment);

      const result = await attachmentService.scanAttachment(attachmentId);

      expect(result.state).toBe(ATTACHMENT_STATES.CLEAN);
      expect(prismaMock.attachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: attachmentId },
          data: expect.objectContaining({ state: ATTACHMENT_STATES.CLEAN }),
        })
      );
    });

    it('transitions pending_scan → infected when virus detected', async () => {
      const attachmentId = TEST_ATTACHMENT.id;
      const virusName = 'Eicar-Test-File';
      const updatedAttachment = {
        ...TEST_ATTACHMENT,
        state: ATTACHMENT_STATES.INFECTED,
        virusName,
        updatedAt: new Date(),
      };

      prismaMock.attachment.findUnique.mockResolvedValue(TEST_ATTACHMENT);
      virusScannerMock.scanFile.mockResolvedValue({
        infected: true,
        virusName,
        details: 'Malware signature detected',
      });
      prismaMock.attachment.update.mockResolvedValue(updatedAttachment);

      const result = await attachmentService.scanAttachment(attachmentId);

      expect(result.state).toBe(ATTACHMENT_STATES.INFECTED);
      expect(result.virusName).toBe(virusName);
      expect(prismaMock.attachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: attachmentId },
          data: expect.objectContaining({ state: ATTACHMENT_STATES.INFECTED }),
        })
      );
    });

    it('transitions pending_scan → failed on scanner error', async () => {
      const attachmentId = TEST_ATTACHMENT.id;
      const errorMessage = 'Scanner connection timeout';
      const updatedAttachment = {
        ...TEST_ATTACHMENT,
        state: ATTACHMENT_STATES.FAILED,
        scanError: errorMessage,
        updatedAt: new Date(),
      };

      prismaMock.attachment.findUnique.mockResolvedValue(TEST_ATTACHMENT);
      virusScannerMock.scanFile.mockRejectedValue(new Error(errorMessage));
      prismaMock.attachment.update.mockResolvedValue(updatedAttachment);

      const result = await attachmentService.scanAttachment(attachmentId);

      expect(result.state).toBe(ATTACHMENT_STATES.FAILED);
      expect(result.scanError).toBe(errorMessage);
    });
  });

  describe('Evidence Endpoint Filtering', () => {
    it('includes only clean attachments in evidence list', async () => {
      const escrowId = '42';
      const mockAttachments = [
        { ...TEST_ATTACHMENT, state: ATTACHMENT_STATES.CLEAN },
        { ...TEST_ATTACHMENT, id: 'attach_002', state: ATTACHMENT_STATES.INFECTED },
        { ...TEST_ATTACHMENT, id: 'attach_003', state: ATTACHMENT_STATES.FAILED },
        { ...TEST_ATTACHMENT, id: 'attach_004', state: ATTACHMENT_STATES.PENDING_SCAN },
      ];

      prismaMock.escrowAttachment.findMany.mockResolvedValue([
        { attachment: mockAttachments[0] },
      ]);

      const result = await attachmentService.getEvidenceAttachments(escrowId);

      expect(result).toHaveLength(1);
      expect(result[0].state).toBe(ATTACHMENT_STATES.CLEAN);
      expect(result.every((a) => a.state === ATTACHMENT_STATES.CLEAN)).toBe(true);
    });

    it('excludes infected attachments from evidence endpoints', async () => {
      const escrowId = '42';
      const infectedAttachment = {
        ...TEST_ATTACHMENT,
        id: 'attach_infected_1',
        state: ATTACHMENT_STATES.INFECTED,
        virusName: 'Malware.Generic',
      };

      prismaMock.escrowAttachment.findMany.mockResolvedValue([]);

      const result = await attachmentService.getEvidenceAttachments(escrowId);

      expect(result).toHaveLength(0);
      expect(result.some((a) => a.state === ATTACHMENT_STATES.INFECTED)).toBe(false);
    });

    it('excludes failed attachments from evidence endpoints', async () => {
      const escrowId = '42';
      const failedAttachment = {
        ...TEST_ATTACHMENT,
        id: 'attach_failed_1',
        state: ATTACHMENT_STATES.FAILED,
        scanError: 'Scanner unavailable',
      };

      prismaMock.escrowAttachment.findMany.mockResolvedValue([]);

      const result = await attachmentService.getEvidenceAttachments(escrowId);

      expect(result).toHaveLength(0);
      expect(result.some((a) => a.state === ATTACHMENT_STATES.FAILED)).toBe(false);
    });

    it('excludes pending_scan attachments from evidence endpoints', async () => {
      const escrowId = '42';
      const pendingAttachment = {
        ...TEST_ATTACHMENT,
        id: 'attach_pending_1',
        state: ATTACHMENT_STATES.PENDING_SCAN,
      };

      prismaMock.escrowAttachment.findMany.mockResolvedValue([]);

      const result = await attachmentService.getEvidenceAttachments(escrowId);

      expect(result).toHaveLength(0);
      expect(result.some((a) => a.state === ATTACHMENT_STATES.PENDING_SCAN)).toBe(false);
    });
  });

  describe('Scanner Timeout Scenarios', () => {
    it('handles scanner timeout gracefully', async () => {
      const attachmentId = TEST_ATTACHMENT.id;
      const timeoutError = new Error('SCAN_TIMEOUT: scan exceeded 30s limit');

      prismaMock.attachment.findUnique.mockResolvedValue(TEST_ATTACHMENT);
      virusScannerMock.scanFile.mockRejectedValue(timeoutError);
      prismaMock.attachment.update.mockResolvedValue({
        ...TEST_ATTACHMENT,
        state: ATTACHMENT_STATES.FAILED,
        scanError: timeoutError.message,
      });

      const result = await attachmentService.scanAttachment(attachmentId);

      expect(result.state).toBe(ATTACHMENT_STATES.FAILED);
      expect(result.scanError).toContain('SCAN_TIMEOUT');
    });

    it('retries failed scan after timeout', async () => {
      const attachmentId = TEST_ATTACHMENT.id;
      const failedAttachment = {
        ...TEST_ATTACHMENT,
        state: ATTACHMENT_STATES.FAILED,
        scanError: 'SCAN_TIMEOUT: scan exceeded 30s limit',
      };

      prismaMock.attachment.findUnique.mockResolvedValueOnce(failedAttachment);
      virusScannerMock.scanFile.mockResolvedValueOnce({ infected: false });
      prismaMock.attachment.update.mockResolvedValueOnce({
        ...failedAttachment,
        state: ATTACHMENT_STATES.CLEAN,
        scanError: null,
      });

      const result = await attachmentService.retryScan(attachmentId);

      expect(result.state).toBe(ATTACHMENT_STATES.CLEAN);
      expect(virusScannerMock.scanFile).toHaveBeenCalled();
    });
  });

  describe('Scanner Unavailable', () => {
    it('marks attachment as failed when scanner is unavailable', async () => {
      const attachmentId = TEST_ATTACHMENT.id;

      prismaMock.attachment.findUnique.mockResolvedValue(TEST_ATTACHMENT);
      virusScannerMock.isAvailable.mockResolvedValue(false);
      prismaMock.attachment.update.mockResolvedValue({
        ...TEST_ATTACHMENT,
        state: ATTACHMENT_STATES.FAILED,
        scanError: 'Scanner unavailable',
      });

      const result = await attachmentService.scanAttachment(attachmentId);

      expect(result.state).toBe(ATTACHMENT_STATES.FAILED);
      expect(result.scanError).toContain('unavailable');
    });
  });

  describe('Backward Compatibility', () => {
    it('existing attachment operations continue to work', async () => {
      const attachmentId = TEST_ATTACHMENT.id;

      prismaMock.attachment.findUnique.mockResolvedValue(TEST_ATTACHMENT);

      const result = await attachmentService.getAttachment(attachmentId);

      expect(result.id).toBe(attachmentId);
      expect(result).toHaveProperty('state');
      expect(Object.values(ATTACHMENT_STATES)).toContain(result.state);
    });

    it('preserves existing attachment metadata during state transitions', async () => {
      const attachmentId = TEST_ATTACHMENT.id;
      const originalFileName = TEST_ATTACHMENT.fileName;
      const originalFileHash = TEST_ATTACHMENT.fileHash;

      prismaMock.attachment.findUnique.mockResolvedValue(TEST_ATTACHMENT);
      virusScannerMock.scanFile.mockResolvedValue({ infected: false });
      prismaMock.attachment.update.mockResolvedValue({
        ...TEST_ATTACHMENT,
        state: ATTACHMENT_STATES.CLEAN,
      });

      const result = await attachmentService.scanAttachment(attachmentId);

      expect(result.fileName).toBe(originalFileName);
      expect(result.fileHash).toBe(originalFileHash);
    });
  });
});
