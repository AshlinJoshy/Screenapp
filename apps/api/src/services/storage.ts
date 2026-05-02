/**
 * Cloudflare R2 storage service.
 * In test/dev without R2 credentials, returns mock URLs.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface PresignedUrlInput {
  creativeId: string;
  filename: string;
  contentType: string;
  expiresInSec?: number;
}

interface PresignedUrlOutput {
  uploadUrl: string;
  fileUrl: string;
  expiresAt: string;
}

function getR2Client(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null; // R2 not configured — dev/test mode
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function generatePresignedUploadUrl(
  input: PresignedUrlInput
): Promise<PresignedUrlOutput> {
  const { creativeId, filename, contentType, expiresInSec = 900 } = input;
  const bucket = process.env.R2_BUCKET_NAME ?? "adscreen-media";
  const publicUrl = process.env.R2_PUBLIC_URL ?? "https://media.adscreen.io";

  // Sanitise filename: keep extension, replace rest with creativeId
  const ext = filename.split(".").pop() ?? "bin";
  const key = `creatives/${creativeId}.${ext}`;
  const fileUrl = `${publicUrl}/${key}`;
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

  const r2 = getR2Client();

  if (!r2) {
    // Dev/test mode — return a mock presigned URL
    return {
      uploadUrl: `http://localhost:9000/${bucket}/${key}?mock=1`,
      fileUrl,
      expiresAt,
    };
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(r2, command, {
    expiresIn: expiresInSec,
  });

  return { uploadUrl, fileUrl, expiresAt };
}
