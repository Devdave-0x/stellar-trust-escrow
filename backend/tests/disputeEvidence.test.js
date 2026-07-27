import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  dispute: { findFirst: jest.fn() },
  userProfile: { findFirst: jest.fn() },
  disputeEvidence: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

const ipfsServiceMock = {
  pinFile: jest.fn(),
  generateThumbnail: jest.fn(),
  getFileUrl: jest.fn(),
  isImage: jest.fn(),
  getFileMetadata: jest.fn(),
};

const virusScannerMock = {
  quickScan: jest.fn(),
};

const websocketMock = {
  broadcastToDispute: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../services/ipfsService.js', () => ({ default: ipfsServiceMock }));
jest.unstable_mockModule('../services/virusScanner.js', () => ({ default: virusScannerMock }));
jest.unstable_mockModule('../api/middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { userId: 1, tenantId: 'test-tenant-id', type: 'access' };
    next();
  },
}));
jest.unstable_mockModule('../api/websocket/handlers.js', () => websocketMock);

const { default: disputeRoutes } = await import('../api/routes/disputeRoutes.js');
const { default: prisma } = await import('../lib/prisma.js');
const { default: ipfsService } = await import('../services/ipfsService.js');
const { default: virusScanner } = await import('../services/virusScanner.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = { id: 'test-tenant-id' };
    next();
  });
  app.use('/api/disputes', disputeRoutes);
  return app;
}

// PDF magic bytes (%PDF) — accepted by the ALLOWED_MIME_TYPES whitelist.
const validPdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
// JPEG magic bytes (SOI + JFIF marker) — needed for the image/thumbnail test.
const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

describe('Dispute Evidence Upload', () => {
  let app;
  let testDispute;
  let testUser;
  const authToken = 'Bearer test-token';

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();

    testUser = {
      userId: 1,
      walletAddress: 'GTEST123456789012345678901234567890123456789012345678',
    };

    testDispute = {
      id: 1,
      tenantId: 'test-tenant-id',
      escrowId: 12345n,
      raisedByAddress: testUser.walletAddress,
      escrow: {
        clientAddress: testUser.walletAddress,
        freelancerAddress: 'GFREELANCER1234567890123456789012345678901234567890123',
        totalAmount: '1000',
        status: 'Disputed',
      },
    };

    prisma.dispute.findFirst.mockResolvedValue(testDispute);
    prisma.userProfile.findFirst.mockResolvedValue({ walletAddress: testUser.walletAddress });
    prisma.disputeEvidence.create.mockImplementation(({ data }) => ({
      id: Math.floor(Math.random() * 1000),
      ...data,
      submittedAt: new Date(),
    }));
    prisma.disputeEvidence.findMany.mockResolvedValue([]);
    prisma.disputeEvidence.count.mockResolvedValue(0);

    ipfsService.pinFile.mockResolvedValue({ cid: 'QmTest123456789', size: validPdfBuffer.length });
    ipfsService.generateThumbnail.mockResolvedValue(Buffer.from('thumbnail-data'));
    ipfsService.getFileUrl.mockImplementation(async (cid) => `https://ipfs.io/ipfs/${cid}`);
    ipfsService.isImage.mockReturnValue(false);
    ipfsService.getFileMetadata.mockResolvedValue({
      filename: 'test.pdf',
      mimeType: 'application/pdf',
      fileSize: validPdfBuffer.length,
    });

    virusScanner.quickScan.mockResolvedValue({
      isInfected: false,
      status: 'clean',
      reason: 'No threats detected',
    });
  });

  describe('POST /api/disputes/:id/evidence', () => {
    it('uploads file evidence successfully', async () => {
      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .attach('files', validPdfBuffer, { filename: 'test.pdf', contentType: 'application/pdf' })
        .field('description', 'Test evidence description');

      expect(response.status).toBe(201);
      expect(response.body.data.evidence).toHaveLength(1);
      expect(response.body.data.count).toBe(1);
      expect(ipfsService.pinFile).toHaveBeenCalled();
      expect(virusScanner.quickScan).toHaveBeenCalled();
      expect(prisma.disputeEvidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            disputeId: 1,
            filename: 'test.pdf',
            ipfsCid: 'QmTest123456789',
            scanStatus: 'clean',
          }),
        }),
      );
    });

    it('uploads image evidence with thumbnail', async () => {
      ipfsService.isImage.mockReturnValue(true);
      ipfsService.getFileMetadata.mockResolvedValue({
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        fileSize: validJpegBuffer.length,
      });
      ipfsService.pinFile
        .mockResolvedValueOnce({ cid: 'QmImage123', size: 100 })
        .mockResolvedValueOnce({ cid: 'QmThumb456', size: 50 });

      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .attach('files', validJpegBuffer, { filename: 'test.jpg', contentType: 'image/jpeg' });

      expect(response.status).toBe(201);
      expect(response.body.data.evidence[0].thumbnailCid).toBe('QmThumb456');
      expect(ipfsService.generateThumbnail).toHaveBeenCalled();
    });

    it('accepts text-only evidence', async () => {
      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .field('description', 'Text-only evidence submission');

      expect(response.status).toBe(201);
      expect(response.body.data.evidence[0].evidenceType).toBe('text');
    });

    it('returns 413 for files larger than 10MB', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);

      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .attach('files', largeBuffer, { filename: 'large.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(413);
      expect(response.body.error).toMatch(/File size/);
    });

    it('returns 400 for more than 5 files', async () => {
      const req = request(app).post('/api/disputes/1/evidence').set('Authorization', authToken);

      for (let i = 1; i <= 6; i += 1) {
        req.attach('files', validPdfBuffer, {
          filename: `test${i}.pdf`,
          contentType: 'application/pdf',
        });
      }

      const response = await req;
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Too many files/);
    });

    it('rejects infected files', async () => {
      virusScanner.quickScan.mockResolvedValue({
        isInfected: true,
        status: 'infected',
        viruses: ['EICAR-Test-File'],
        reason: 'Malicious content detected',
      });

      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .attach('files', validPdfBuffer, {
          filename: 'infected.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Virus detected');
      expect(response.body.infectedFiles).toHaveLength(1);
    });

    it('rejects non-participants', async () => {
      prisma.userProfile.findFirst.mockResolvedValue({
        walletAddress: 'GOTHER123456789012345678901234567890123456789012345678',
      });

      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .attach('files', validPdfBuffer, { filename: 'test.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });

    it('handles IPFS upload failures gracefully', async () => {
      ipfsService.pinFile.mockRejectedValue(new Error('IPFS gateway unavailable'));

      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .attach('files', validPdfBuffer, { filename: 'test.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('IPFS upload failed');
    });
  });

  describe('GET /api/disputes/:id/evidence', () => {
    beforeEach(() => {
      prisma.disputeEvidence.findMany.mockResolvedValue([
        {
          id: 1,
          disputeId: 1,
          evidenceType: 'file',
          ipfsCid: 'QmTest123',
          thumbnailCid: null,
          filename: 'test.pdf',
          submittedBy: testUser.walletAddress,
          submittedAt: new Date(),
        },
        {
          id: 2,
          disputeId: 1,
          evidenceType: 'image',
          ipfsCid: 'QmImage456',
          thumbnailCid: 'QmThumb789',
          filename: 'test.jpg',
          submittedBy: testUser.walletAddress,
          submittedAt: new Date(),
        },
      ]);
      prisma.disputeEvidence.count.mockResolvedValue(2);
    });

    it('lists evidence with IPFS URLs', async () => {
      const response = await request(app)
        .get('/api/disputes/1/evidence')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[1].thumbnailUrl).toBe('https://ipfs.io/ipfs/QmThumb789');
    });

    it('filters by evidence type', async () => {
      await request(app)
        .get('/api/disputes/1/evidence?evidenceType=image')
        .set('Authorization', authToken);

      expect(prisma.disputeEvidence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ evidenceType: 'image' }),
        }),
      );
    });
  });
});
