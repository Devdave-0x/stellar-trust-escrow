import { jest } from '@jest/globals';

const prismaMock = {
  attachment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
};

const s3SendMock = jest.fn();
const getSignedUrlMock = jest.fn();

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../lib/s3.js', () => ({
  default: { send: s3SendMock },
  ATTACHMENTS_BUCKET: 'test-bucket',
}));
jest.unstable_mockModule('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

const { default: attachmentController } =
  await import('../api/controllers/attachmentController.js');

const UPLOADER = `G${'A'.repeat(55)}`;
const OTHER_USER = `G${'B'.repeat(55)}`;

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('uploadAttachment', () => {
  it('uploads a file to S3 and records metadata', async () => {
    s3SendMock.mockResolvedValue({});
    prismaMock.attachment.create.mockResolvedValue({ id: 1, filename: 'evidence.pdf' });

    const req = {
      file: {
        originalname: 'evidence.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test'),
      },
      body: { entityType: 'dispute', entityId: '42' },
      userAddress: UPLOADER,
    };
    const res = createResponse();
    await attachmentController.uploadAttachment(req, res);

    expect(s3SendMock).toHaveBeenCalled();
    expect(prismaMock.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'dispute',
          entityId: '42',
          filename: 'evidence.pdf',
          uploadedBy: UPLOADER,
        }),
      }),
    );
    expect(res.statusCode).toBe(201);
  });

  it('rejects an invalid entityType', async () => {
    const req = {
      file: {
        originalname: 'f.pdf',
        mimetype: 'application/pdf',
        size: 1,
        buffer: Buffer.from(''),
      },
      body: { entityType: 'invoice', entityId: '1' },
      userAddress: UPLOADER,
    };
    const res = createResponse();
    await attachmentController.uploadAttachment(req, res);

    expect(res.statusCode).toBe(400);
    expect(s3SendMock).not.toHaveBeenCalled();
  });
});

describe('getDownloadUrl', () => {
  it('returns a signed URL for an active attachment', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      id: 1,
      s3Key: 'attachments/dispute/42/file.pdf',
      deletedAt: null,
    });
    getSignedUrlMock.mockResolvedValue('https://s3.example.com/signed');

    const req = { params: { id: '1' } };
    const res = createResponse();
    await attachmentController.getDownloadUrl(req, res);

    expect(getSignedUrlMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      expiresIn: 900,
    });
    expect(res.body).toMatchObject({ url: 'https://s3.example.com/signed', expiresIn: 900 });
  });

  it('404s for a soft-deleted attachment', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({ id: 1, deletedAt: new Date() });

    const res = createResponse();
    await attachmentController.getDownloadUrl({ params: { id: '1' } }, res);

    expect(res.statusCode).toBe(404);
  });
});

describe('deleteAttachment', () => {
  it('allows the uploader to delete', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      id: 1,
      uploadedBy: UPLOADER,
      deletedAt: null,
    });
    prismaMock.attachment.update.mockResolvedValue({ id: 1, deletedAt: new Date() });

    const req = { params: { id: '1' }, userAddress: UPLOADER, headers: {} };
    const res = createResponse();
    await attachmentController.deleteAttachment(req, res);

    expect(prismaMock.attachment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('allows an admin to delete on behalf of another uploader', async () => {
    process.env.ADMIN_API_KEY = 'test-admin-key';
    prismaMock.attachment.findUnique.mockResolvedValue({
      id: 1,
      uploadedBy: UPLOADER,
      deletedAt: null,
    });
    prismaMock.attachment.update.mockResolvedValue({ id: 1, deletedAt: new Date() });

    const req = {
      params: { id: '1' },
      userAddress: OTHER_USER,
      headers: { 'x-admin-api-key': 'test-admin-key' },
    };
    const res = createResponse();
    await attachmentController.deleteAttachment(req, res);

    expect(res.statusCode).toBe(200);
    delete process.env.ADMIN_API_KEY;
  });

  it('blocks a non-uploader, non-admin from deleting', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      id: 1,
      uploadedBy: UPLOADER,
      deletedAt: null,
    });

    const req = { params: { id: '1' }, userAddress: OTHER_USER, headers: {} };
    const res = createResponse();
    await attachmentController.deleteAttachment(req, res);

    expect(res.statusCode).toBe(403);
    expect(prismaMock.attachment.update).not.toHaveBeenCalled();
  });
});

describe('listAttachments', () => {
  it('lists active attachments for an entity', async () => {
    prismaMock.attachment.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const req = { params: { entityType: 'escrow', entityId: '7' } };
    const res = createResponse();
    await attachmentController.listAttachments(req, res);

    expect(prismaMock.attachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityType: 'escrow', entityId: '7', deletedAt: null },
      }),
    );
    expect(res.body.attachments).toHaveLength(2);
  });

  it('rejects an unknown entityType', async () => {
    const req = { params: { entityType: 'invoice', entityId: '7' } };
    const res = createResponse();
    await attachmentController.listAttachments(req, res);

    expect(res.statusCode).toBe(400);
  });
});
