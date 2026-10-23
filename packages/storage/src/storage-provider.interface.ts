export interface UploadFileInput {
  tenantId: string;
  storeId: string;
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  prefix?: string; // e.g. 'products', 'branding', 'themes'
}

export interface UploadFileResult {
  storageKey: string;
  filePath: string;
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
}

export interface FileMetadata {
  storageKey: string;
  sizeBytes: number;
  mimeType: string;
  lastModified: Date;
}

export interface StorageProvider {
  readonly kind?: 'LOCAL' | 'S3';
  upload(input: UploadFileInput): Promise<UploadFileResult>;
  delete(storageKey: string): Promise<boolean>;
  getUrl(storageKey: string): string;
  getMetadata(storageKey: string): Promise<FileMetadata | null>;
  exists(storageKey: string): Promise<boolean>;
}
