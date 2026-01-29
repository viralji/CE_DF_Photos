import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'ce-df-photos';

export async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}

export async function getSignedUrlForS3(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
    { expiresIn }
  );
}

export async function getObjectFromS3(key: string): Promise<{ body: Buffer; contentType?: string }> {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  const body = response.Body;
  if (!body) throw new Error('Empty S3 object');
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return { body: buffer, contentType: response.ContentType ?? 'image/jpeg' };
}

const S3_PREFIX = process.env.AWS_S3_PHOTOS_PREFIX || 'df-photos';

export function getS3Key(filename: string): string {
  return `${S3_PREFIX}/${filename}`;
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
}
