import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  attachment: {
    create: jest.fn(),
  },
};

const s3SendMock = jest.fn();

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

describe('POST /api/attachments', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
    s3SendMock.mockResolvedValue({});
    prismaMock.attachment.create.mockImplementation(({ data }) => ({ id: 1, ...data }));
  });

  it('accepts a file within the size limit', async () => {
    const response = await request(app)
      .post('/api/attachments')
      .set('x-user-address', VALID_ADDRESS)
      .field('entityType', 'escrow')
      .field('entityId', '1')
      .attach('file', Buffer.from('%PDF-1.4 test content'), {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(201);
    expect(s3SendMock).toHaveBeenCalled();
  });

  it('rejects a file over the size limit with 413', async () => {
    const largeBuffer = Buffer.alloc(26 * 1024 * 1024); // > MAX_ATTACHMENT_SIZE_BYTES (25MB)

    const response = await request(app)
      .post('/api/attachments')
      .set('x-user-address', VALID_ADDRESS)
      .field('entityType', 'escrow')
      .field('entityId', '1')
      .attach('file', largeBuffer, { filename: 'large.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(413);
    expect(s3SendMock).not.toHaveBeenCalled();
  });

  it('rejects a disallowed MIME type with 422', async () => {
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
    expect(s3SendMock).not.toHaveBeenCalled();
  });

  it('rejects an empty (0 byte) file', async () => {
    const response = await request(app)
      .post('/api/attachments')
      .set('x-user-address', VALID_ADDRESS)
      .field('entityType', 'escrow')
      .field('entityId', '1')
      .attach('file', Buffer.alloc(0), { filename: 'empty.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(422);
    expect(s3SendMock).not.toHaveBeenCalled();
  });

  it('sanitises a path-traversal filename before it reaches S3 or the database', async () => {
    const response = await request(app)
      .post('/api/attachments')
      .set('x-user-address', VALID_ADDRESS)
      .field('entityType', 'escrow')
      .field('entityId', '1')
      .attach('file', Buffer.from('%PDF-1.4 test content'), {
        filename: '../../../etc/passwd.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(201);

    // The filename must not be able to inject extra "/" segments into the S3
    // key — that's the only part of "../../../etc/passwd.pdf" that could
    // actually escape the intended attachments/{entityType}/{entityId}/ prefix.
    const [[putCommand]] = s3SendMock.mock.calls;
    const key = putCommand.input.Key;
    expect(key.split('/')).toHaveLength(4);
    expect(key.startsWith(`attachments/escrow/1/`)).toBe(true);

    expect(prismaMock.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ filename: expect.not.stringContaining('/') }),
      }),
    );
  });

  it('rejects a request missing the x-user-address header', async () => {
    const response = await request(app)
      .post('/api/attachments')
      .field('entityType', 'escrow')
      .field('entityId', '1')
      .attach('file', Buffer.from('%PDF-1.4 test content'), {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(401);
    expect(s3SendMock).not.toHaveBeenCalled();
  });
});
