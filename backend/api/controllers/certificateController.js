/**
 * Certificate Controller
 *
 * Streams a signed, QR-coded PDF certificate of completion for a
 * finished escrow.
 *
 * @module controllers/certificateController
 */

import prisma from '../../lib/prisma.js';
import certificateService from '../../services/certificateService.js';

/**
 * GET /api/escrows/:id/certificate
 */
const getCertificate = async (req, res) => {
  try {
    const id = BigInt(req.params.id);

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      include: {
        milestones: {
          orderBy: { milestoneIndex: 'asc' },
          select: { title: true, resolvedAt: true, status: true },
        },
      },
    });

    if (!escrow || escrow.status !== 'Completed') {
      return res.status(404).json({ error: 'Certificate is only available for completed escrows' });
    }

    const content = certificateService.buildCertificateContent(escrow);
    const signature = certificateService.signContent(content);
    const shareUrl = await certificateService.resolveShareUrl(prisma, escrow.id, req.user?.address);

    const doc = await certificateService.renderCertificatePdf(content, signature, shareUrl);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="escrow-${escrow.id}-certificate.pdf"`,
    );
    doc.pipe(res);
    doc.end();
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    res.status(500).json({ error: err.message });
  }
};

export default { getCertificate };
