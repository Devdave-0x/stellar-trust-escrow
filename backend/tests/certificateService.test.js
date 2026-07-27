import { jest } from '@jest/globals';
import crypto from 'crypto';
import certificateService from '../services/certificateService.js';

const escrow = {
  id: 42n,
  title: 'Landing page redesign',
  clientAddress: 'GCLIENT'.padEnd(56, 'A'),
  freelancerAddress: 'GFREELANCER'.padEnd(56, 'B'),
  arbiterAddress: null,
  totalAmount: '1000',
  tokenAddress: 'GTOKEN'.padEnd(56, 'C'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-02-01T00:00:00Z'),
  milestones: [
    { title: 'Design mockups', resolvedAt: new Date('2026-01-15T00:00:00Z'), status: 'Approved' },
    { title: 'Final delivery', resolvedAt: new Date('2026-02-01T00:00:00Z'), status: 'Approved' },
  ],
};

describe('certificateService', () => {
  it('builds certificate content from a completed escrow', () => {
    const content = certificateService.buildCertificateContent(escrow);

    expect(content).toEqual({
      escrowId: '42',
      title: 'Landing page redesign',
      clientAddress: escrow.clientAddress,
      freelancerAddress: escrow.freelancerAddress,
      arbiterAddress: null,
      amount: '1000',
      currency: escrow.tokenAddress,
      completionDate: '2026-02-01T00:00:00.000Z',
      milestones: [
        { title: 'Design mockups', completedAt: '2026-01-15T00:00:00.000Z' },
        { title: 'Final delivery', completedAt: '2026-02-01T00:00:00.000Z' },
      ],
    });
  });

  it('produces an HMAC signature matching a manual computation with the platform secret', () => {
    const content = certificateService.buildCertificateContent(escrow);
    const signature = certificateService.signContent(content);

    const secret = process.env.CERTIFICATE_SIGNING_SECRET || 'fallback_certificate_secret';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(content, Object.keys(content).sort()))
      .digest('hex');

    expect(signature).toBe(expected);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces a different signature when content changes', () => {
    const content = certificateService.buildCertificateContent(escrow);
    const tampered = { ...content, amount: '9999999' };

    expect(certificateService.signContent(content)).not.toBe(
      certificateService.signContent(tampered),
    );
  });

  it('renders a PDF document that emits bytes', async () => {
    const content = certificateService.buildCertificateContent(escrow);
    const signature = certificateService.signContent(content);
    const shareUrl = 'http://localhost:4000/api/share/some-token';

    const doc = await certificateService.renderCertificatePdf(content, signature, shareUrl);

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const done = new Promise((resolve) => doc.on('end', resolve));
    doc.end();
    await done;

    const pdfBuffer = Buffer.concat(chunks);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  describe('resolveShareUrl', () => {
    it('reuses an existing active share link instead of creating a new one', async () => {
      const prismaMock = {
        escrowShareLink: {
          findFirst: jest.fn().mockResolvedValue({ token: 'existing-token' }),
          create: jest.fn(),
        },
      };

      const url = await certificateService.resolveShareUrl(prismaMock, 42n, 'GADDRESS');

      expect(url).toBe(
        `${process.env.API_BASE_URL || 'http://localhost:4000'}/api/share/existing-token`,
      );
      expect(prismaMock.escrowShareLink.create).not.toHaveBeenCalled();
    });

    it('creates a new share link when none exists', async () => {
      const prismaMock = {
        escrowShareLink: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ token: 'new-token' }),
        },
      };

      const url = await certificateService.resolveShareUrl(prismaMock, 42n, 'GADDRESS');

      expect(url).toBe(
        `${process.env.API_BASE_URL || 'http://localhost:4000'}/api/share/new-token`,
      );
      expect(prismaMock.escrowShareLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          escrowId: 42n,
          createdBy: 'GADDRESS',
        }),
      });
    });
  });
});
