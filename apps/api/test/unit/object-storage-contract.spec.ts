import { S3StorageProvider } from '@simply/storage';
import { Readable } from 'node:stream';

describe('S3/R2 public media adapter contract (isolated SDK transport)', () => {
  it('uploads actual bytes, reads/replaces/deletes public product and branding images, and excludes KYC', async () => {
    const objects = new Map<string, { bytes: Buffer; mime: string }>();
    const send = jest.fn(async (command: any) => {
      const input = command.input;
      switch (command.constructor.name) {
        case 'PutObjectCommand': objects.set(input.Key, { bytes: Buffer.from(input.Body), mime: input.ContentType }); return {};
        case 'HeadObjectCommand': {
          const object = objects.get(input.Key);
          if (!object) throw Object.assign(new Error('missing'), { $metadata: { httpStatusCode: 404 } });
          return { ContentLength: object.bytes.length, ContentType: object.mime };
        }
        case 'GetObjectCommand': return { Body: Readable.from([objects.get(input.Key)!.bytes]) };
        case 'DeleteObjectCommand': objects.delete(input.Key); return {};
        default: throw Error('Unexpected SDK command');
      }
    });
    const storage = new S3StorageProvider({ bucket: 'owned', region: 'auto', endpoint: 'https://storage.example.test', accessKeyId: 'fixture', secretAccessKey: 'fixture', publicUrlPrefix: 'https://media.example.test' }, { send } as any);
    for (const prefix of ['products', 'branding']) {
      const first = await storage.upload({ tenantId: 'tenant-a', storeId: 'store-a', prefix, originalFilename: 'original.png', mimeType: 'image/png', buffer: Buffer.from('actual-original-bytes') });
      const replacement = await storage.upload({ tenantId: 'tenant-a', storeId: 'store-a', prefix, originalFilename: 'replacement.png', mimeType: 'image/png', buffer: Buffer.from('actual-replacement-bytes') });
      expect(first.storageKey).not.toBe(replacement.storageKey);
      expect(first.publicUrl).toBe(`https://media.example.test/${first.storageKey}`);
      const chunks: Buffer[] = [];
      for await (const chunk of await storage.getStream(replacement.storageKey) as any) chunks.push(chunk);
      expect(Buffer.concat(chunks).toString()).toBe('actual-replacement-bytes');
      expect((await storage.getMetadata(replacement.storageKey))?.mimeType).toBe('image/png');
      await storage.delete(first.storageKey);
      expect(await storage.exists(first.storageKey)).toBe(false);
      expect(await storage.exists(replacement.storageKey)).toBe(true);
      await storage.delete(replacement.storageKey);
    }
    const before = send.mock.calls.length;
    await expect(storage.upload({ tenantId: 'tenant-a', storeId: 'store-a', prefix: 'kyc', originalFilename: 'private.png', mimeType: 'image/png', buffer: Buffer.from('private') })).rejects.toThrow(/Invalid public/);
    expect(send.mock.calls).toHaveLength(before);
    expect(() => storage.getUrl('../private/document.pdf')).toThrow();
  });
});
