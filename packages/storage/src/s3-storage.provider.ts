import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { StorageProvider, UploadFileInput, UploadFileResult, FileMetadata } from './storage-provider.interface';

export interface S3StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicUrlPrefix: string;
  forcePathStyle?: boolean;
}

/** Public merchant media only. Private KYC documents never enter this provider. */
export class S3StorageProvider implements StorageProvider {
  public readonly kind = 'S3' as const;
  private readonly client: S3Client;
  constructor(private readonly config: S3StorageConfig, client?: S3Client) {
    for (const key of ['bucket','region','publicUrlPrefix','accessKeyId','secretAccessKey'] as const)
      if (!config[key]?.trim()) throw new Error(`Object storage configuration missing: ${key}`);
    const publicUrl = new URL(config.publicUrlPrefix);
    if (publicUrl.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(publicUrl.hostname))
      throw new Error('Object storage public media URL must use HTTPS.');
    this.client = client || new S3Client({
      region: config.region, endpoint: config.endpoint, forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId!, secretAccessKey: config.secretAccessKey! },
      maxAttempts: 3, requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 },
    });
  }
  private key(key: string) {
    if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/(?:products|branding)\/[a-zA-Z0-9_.-]+$/.test(key))
      throw new Error('Invalid public merchant media key.');
    return key;
  }
  public async upload(input: UploadFileInput): Promise<UploadFileResult> {
    const ext = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif','image/gif':'gif'} as Record<string,string>)[input.mimeType];
    if (!ext || !input.buffer.length || input.buffer.length > 5 * 1024 * 1024) throw new Error('Invalid public image type or size.');
    const storageKey = this.key(`${input.tenantId}/${input.storeId}/${input.prefix || 'products'}/${randomUUID()}.${ext}`);
    await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: storageKey, Body: input.buffer,
      ContentType: input.mimeType, CacheControl: 'public, max-age=31536000, immutable' }), { abortSignal: AbortSignal.timeout(20000) });
    return { storageKey, filePath: `s3://${this.config.bucket}/${storageKey}`, publicUrl: this.getUrl(storageKey), mimeType: input.mimeType, sizeBytes: input.buffer.length };
  }
  public getUrl(storageKey: string): string {
    return `${this.config.publicUrlPrefix.replace(/\/+$/, '')}/${this.key(storageKey).split('/').map(encodeURIComponent).join('/')}`;
  }
  public async delete(storageKey: string): Promise<boolean> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.key(storageKey) }), { abortSignal: AbortSignal.timeout(20000) });
    return true;
  }
  public async getMetadata(storageKey: string): Promise<FileMetadata | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: this.key(storageKey) }), { abortSignal: AbortSignal.timeout(15000) });
      return { storageKey, sizeBytes: result.ContentLength || 0, mimeType: result.ContentType || 'application/octet-stream', lastModified: result.LastModified || new Date(0) };
    } catch (error: any) {
      if (error.$metadata?.httpStatusCode === 404 || error.name === 'NotFound' || error.name === 'NoSuchKey') return null;
      throw error;
    }
  }
  public async exists(storageKey: string): Promise<boolean> { return Boolean(await this.getMetadata(storageKey)); }

  public async getStream(storageKey: string): Promise<NodeJS.ReadableStream> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: this.key(storageKey),
    });
    const result = await this.client.send(command, { abortSignal: AbortSignal.timeout(20000) });
    if (!result.Body) throw new Error(`Empty body for key ${storageKey}`);
    return result.Body as unknown as NodeJS.ReadableStream;
  }
}
