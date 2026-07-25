/**
 * Certificate Service
 *
 * Builds the signed content for an escrow completion certificate and
 * renders it as a streamable PDF with an embedded QR code linking to the
 * escrow's public share page.
 *
 * @module services/certificateService
 */

import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const SHARE_LINK_TTL_DAYS = 30;

/**
 * Builds the plain (unsigned) certificate content for a completed escrow.
 *
 * @param {object} escrow — an Escrow row with its `milestones` included
 * @returns {object}
 */
function buildCertificateContent(escrow) {
  return {
    escrowId: escrow.id.toString(),
    title: escrow.title || `Escrow #${escrow.id}`,
    clientAddress: escrow.clientAddress,
    freelancerAddress: escrow.freelancerAddress,
    arbiterAddress: escrow.arbiterAddress || null,
    amount: escrow.totalAmount,
    currency: escrow.tokenAddress,
    completionDate: (escrow.updatedAt ?? escrow.createdAt).toISOString(),
    milestones: escrow.milestones.map((m) => ({
      title: m.title,
      completedAt: m.resolvedAt ? m.resolvedAt.toISOString() : null,
    })),
  };
}

/** Canonical, stable-key-order JSON string used as the HMAC input. */
function canonicalize(content) {
  return JSON.stringify(content, Object.keys(content).sort());
}

/**
 * Signs certificate content with the platform secret key.
 *
 * @param {object} content
 * @returns {string} hex-encoded HMAC-SHA256 digest
 */
function signContent(content) {
  const secret = process.env.CERTIFICATE_SIGNING_SECRET || 'fallback_certificate_secret';
  return crypto.createHmac('sha256', secret).update(canonicalize(content)).digest('hex');
}

/**
 * Resolves the public share URL for an escrow, embedded in the certificate's
 * QR code — reuses an existing active EscrowShareLink (see
 * shareLinkController.js) or creates one if none exists.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {bigint} escrowId
 * @param {string} [requesterAddress]
 * @returns {Promise<string>}
 */
async function resolveShareUrl(prisma, escrowId, requesterAddress) {
  const existing = await prisma.escrowShareLink.findFirst({
    where: {
      escrowId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
  });

  const link =
    existing ??
    (await prisma.escrowShareLink.create({
      data: {
        token: crypto.randomBytes(24).toString('base64url'),
        escrowId,
        createdBy: requesterAddress ?? 'system:certificate',
        expiresAt: new Date(Date.now() + SHARE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    }));

  const baseUrl = process.env.API_BASE_URL || 'http://localhost:4000';
  return `${baseUrl}/api/share/${link.token}`;
}

/**
 * Renders a completed escrow certificate as a PDF document (a readable stream).
 * Caller is responsible for piping it to the response and calling `.end()`.
 *
 * @param {object} content — from buildCertificateContent()
 * @param {string} signature — from signContent()
 * @param {string} shareUrl — from buildShareUrl()
 * @returns {Promise<PDFDocument>}
 */
async function renderCertificatePdf(content, signature, shareUrl) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const qrPngBuffer = await QRCode.toBuffer(shareUrl, { width: 150 });

  doc.fontSize(20).text('Escrow Completion Certificate', { align: 'center' });
  doc.moveDown();

  doc.fontSize(12);
  doc.text(`Escrow ID: ${content.escrowId}`);
  doc.text(`Title: ${content.title}`);
  doc.text(`Client: ${content.clientAddress}`);
  doc.text(`Freelancer: ${content.freelancerAddress}`);
  if (content.arbiterAddress) doc.text(`Arbiter: ${content.arbiterAddress}`);
  doc.text(`Amount: ${content.amount}`);
  doc.text(`Currency / Token: ${content.currency}`);
  doc.text(`Completion Date: ${content.completionDate}`);
  doc.moveDown();

  doc.fontSize(14).text('Milestones', { underline: true });
  doc.fontSize(12);
  if (content.milestones.length === 0) {
    doc.text('None');
  } else {
    for (const m of content.milestones) {
      doc.text(`- ${m.title} — completed ${m.completedAt ?? 'N/A'}`);
    }
  }
  doc.moveDown();

  doc.fontSize(14).text('Platform Signature', { underline: true });
  doc.fontSize(10).text(signature, { width: 500 });
  doc.moveDown();

  doc.image(qrPngBuffer, { fit: [150, 150] });
  doc.fontSize(10).text(shareUrl, { link: shareUrl });

  return doc;
}

export default {
  buildCertificateContent,
  signContent,
  resolveShareUrl,
  renderCertificatePdf,
};
