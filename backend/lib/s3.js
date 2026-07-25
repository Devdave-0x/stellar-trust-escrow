/**
 * S3 Client
 *
 * Shared client for attachment storage (Issue #221). Bucket and signed-URL
 * helpers live in the attachment controller; this module just wires up the
 * SDK client from env config.
 */

import { S3Client } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.AWS_ACCESS_KEY_ID && {
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  }),
});

export const ATTACHMENTS_BUCKET = process.env.AWS_S3_ATTACHMENTS_BUCKET;

export default s3Client;
