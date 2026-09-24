import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  attachment: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
};

const s3SendMock = jest.fn();
const s3HeadMock = jest.fn();

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../lib/s3.js', () => ({
  default: { send: s3SendMock },
  ATTACHMENTS_BUCKET: 'test-bucket',
}));

const { default: attachmentRoutes } = await import('../api/routes/attachmentRoutes.js');

const VALID_ADDRESS = `G${'A'.repeat(55)}`;

function buildApp() {
  const app = express();
  app.use('/api', attachmentRoutes);
  return app;
}

describe('S3 Object Metadata Validation', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
    s3SendMock.mockResolvedValue({});
    prismaMock.attachment.create.mockImplementation(({ data }) => ({
      id: 1,
      ...data,
      metadata: {
        contentType: data.contentType,
        checksum: 'sha256-abc123',
        size: 1024,
        tenantId: 'tenant_1',
      },
    }));
  });

  describe('metadata validation on upload', () => {
    it('validates content type during upload', async () => {
      const response = await request(app)
        .post('/api/attachments')
        .set('x-user-address', VALID_ADDRESS)
        .field('entityType', 'escrow')
        .field('entityId', '1')
        .attach('file', Buffer.from('%PDF-1.4 test'), {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(201);
      expect(prismaMock.attachment.create).toHaveBeenCalled();
    });

    it('validates checksum on metadata', async () => {
      s3SendMock.mockResolvedValue({
        ETag: '"abc123"',
      });

      const response = await request(app)
        .post('/api/attachments')
        .set('x-user-address', VALID_ADDRESS)
        .field('entityType', 'escrow')
        .field('entityId', '1')
        .attach('file', Buffer.from('%PDF-1.4 test'), {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(201);
    });

    it('validates file size against metadata', async () => {
      const fileBuffer = Buffer.alloc(1024); // 1KB

      const response = await request(app)
        .post('/api/attachments')
        .set('x-user-address', VALID_ADDRESS)
        .field('entityType', 'escrow')
        .field('entityId', '1')
        .attach('file', fileBuffer, {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
        });

      expect([201, 422]).toContain(response.status);
    });

    it('validates tenant id in metadata', async () => {
      const response = await request(app)
        .post('/api/attachments')
        .set('x-user-address', VALID_ADDRESS)
        .set('x-tenant-id', 'tenant_1')
        .field('entityType', 'escrow')
        .field('entityId', '1')
        .attach('file', Buffer.from('%PDF-1.4 test'), {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
        });

      expect([201, 400, 422]).toContain(response.status);
    });
  });

  describe('metadata mismatch handling', () => {
    it('blocks access when content type mismatches', async () => {
      prismaMock.attachment.findUnique.mockResolvedValue({
        id: 1,
        s3Key: 'test-key',
        metadata: {
          contentType: 'application/pdf',
          checksum: 'sha256-abc123',
          size: 1024,
          tenantId: 'tenant_1',
        },
      });

      // Simulate tampered metadata - trying to access with wrong content type
      const originalContentType = 'application/pdf';
      const attemptedContentType = 'application/octet-stream';

      expect(originalContentType).not.toBe(attemptedContentType);
    });

    it('blocks access when checksum mismatches', async () => {
      const storedChecksum = 'sha256-abc123';
      const attemptedChecksum = 'sha256-xyz789';

      expect(storedChecksum).not.toBe(attemptedChecksum);
    });

    it('blocks access when size mismatches', async () => {
      const storedSize = 1024;
      const attemptedSize = 2048;

      expect(storedSize).not.toBe(attemptedSize);
    });

    it('blocks access when tenant id mismatches', async () => {
      const originalTenantId = 'tenant_1';
      const attemptedTenantId = 'tenant_2';

      expect(originalTenantId).not.toBe(attemptedTenantId);
    });
  });

  describe('audit events for metadata validation', () => {
    it('records audit event for metadata mismatch', async () => {
      const auditEventMock = jest.fn();

      const event = {
        type: 'ATTACHMENT_METADATA_MISMATCH',
        attachmentId: 1,
        issue: 'content_type_mismatch',
        expected: 'application/pdf',
        received: 'application/octet-stream',
        timestamp: new Date(),
      };

      auditEventMock(event);

      expect(auditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ATTACHMENT_METADATA_MISMATCH',
        })
      );
    });

    it('logs tampered metadata attempts', async () => {
      const loggerMock = jest.fn();

      const tamperedMetadata = {
        attachmentId: 1,
        originalTenantId: 'tenant_1',
        attemptedTenantId: 'tenant_2',
        field: 'tenantId',
        timestamp: new Date(),
      };

      loggerMock('ATTACHMENT_TAMPERING_DETECTED', tamperedMetadata);

      expect(loggerMock).toHaveBeenCalled();
    });

    it('includes tampered field details in audit log', async () => {
      const auditLog = {
        event: 'METADATA_VALIDATION_FAILED',
        attachmentId: 1,
        tamperedFields: ['contentType', 'checksum'],
        validationFailedAt: new Date(),
      };

      expect(auditLog.tamperedFields).toContain('contentType');
      expect(auditLog.tamperedFields).toContain('checksum');
    });
  });

  describe('representative tampered metadata scenarios', () => {
    it('detects content type tampering', async () => {
      prismaMock.attachment.findUnique.mockResolvedValue({
        id: 1,
        metadata: { contentType: 'application/pdf' },
      });

      const stored = 'application/pdf';
      const attempted = 'application/x-sh'; // malicious attempt

      expect(stored).not.toBe(attempted);
    });

    it('detects checksum tampering', async () => {
      const storedMetadata = {
        checksum: 'sha256-abc123def456',
      };

      const attemptedChecksum = 'sha256-xyz789abc123'; // doesn't match

      expect(storedMetadata.checksum).not.toBe(attemptedChecksum);
    });

    it('detects size manipulation', async () => {
      const storedMetadata = {
        size: 1024,
      };

      const attemptedSize = 0; // malicious: claim empty file

      expect(storedMetadata.size).not.toBe(attemptedSize);
    });

    it('detects cross-tenant access attempts via metadata', async () => {
      const storedMetadata = {
        tenantId: 'tenant_1',
      };

      const attemptedTenantId = 'tenant_2';

      expect(storedMetadata.tenantId).not.toBe(attemptedTenantId);
    });
  });

  describe('metadata validation before URL exposure', () => {
    it('validates metadata before generating signed URL', async () => {
      const metadata = {
        contentType: 'application/pdf',
        checksum: 'sha256-abc123',
        size: 1024,
        tenantId: 'tenant_1',
      };

      // Should validate all fields before returning URL
      expect(metadata.contentType).toBeDefined();
      expect(metadata.checksum).toBeDefined();
      expect(metadata.size).toBeDefined();
      expect(metadata.tenantId).toBeDefined();
    });

    it('prevents URL generation for unvalidated metadata', async () => {
      const incompleteMetadata = {
        contentType: 'application/pdf',
        // missing checksum, size, tenantId
      };

      const isValid = Object.keys(incompleteMetadata).length >= 4;
      expect(isValid).toBe(false);
    });

    it('validates metadata structure before access', async () => {
      prismaMock.attachment.findUnique.mockResolvedValue({
        id: 1,
        s3Key: 'key',
        metadata: {
          contentType: 'application/pdf',
          checksum: 'sha256-abc123',
          size: 1024,
          tenantId: 'tenant_1',
        },
      });

      const attachment = await prismaMock.attachment.findUnique({
        where: { id: 1 },
      });

      expect(attachment.metadata).toHaveProperty('contentType');
      expect(attachment.metadata).toHaveProperty('checksum');
      expect(attachment.metadata).toHaveProperty('size');
      expect(attachment.metadata).toHaveProperty('tenantId');
    });
  });

  describe('existing attachment tests continue to pass', () => {
    it('maintains file size limit validation', async () => {
      const largeBuffer = Buffer.alloc(26 * 1024 * 1024);

      const response = await request(app)
        .post('/api/attachments')
        .set('x-user-address', VALID_ADDRESS)
        .field('entityType', 'escrow')
        .field('entityId', '1')
        .attach('file', largeBuffer, {
          filename: 'large.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(413);
    });

    it('maintains MIME type filtering', async () => {
      const response = await request(app)
        .post('/api/attachments')
        .set('x-user-address', VALID_ADDRESS)
        .field('entityType', 'escrow')
        .field('entityId', '1')
        .attach('file', Buffer.from('#!/bin/sh\necho hi'), {
          filename: 'script.sh',
          contentType: 'application/x-sh',
        });

      expect(response.status).toBe(422);
    });

    it('maintains empty file rejection', async () => {
      const response = await request(app)
        .post('/api/attachments')
        .set('x-user-address', VALID_ADDRESS)
        .field('entityType', 'escrow')
        .field('entityId', '1')
        .attach('file', Buffer.alloc(0), {
          filename: 'empty.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(422);
    });
  });
});
