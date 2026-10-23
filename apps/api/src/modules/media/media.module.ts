import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaService, STORAGE_PROVIDER_TOKEN } from './media.service';
import { MediaController } from './media.controller';
import { StorageFactory } from '@simply/storage';
import { localMediaRoot } from './local-media-root';
import * as path from 'node:path';

@Global()
@Module({
  controllers: [MediaController],
  providers: [
    {
      provide: STORAGE_PROVIDER_TOKEN,
      useFactory: (configService: ConfigService) => {
        const rawDriver = (
          configService.get<string>('STORAGE_PROVIDER') ||
          configService.get<string>('MEDIA_STORAGE_PROVIDER') ||
          configService.get<string>('MEDIA_STORAGE_DRIVER') ||
          'local'
        ).toLowerCase();
        const driver = (rawDriver === 's3' || rawDriver === 'r2') ? 's3' : 'local';

        const rootDir = localMediaRoot(configService.get<string>('MEDIA_STORAGE_LOCAL_ROOT', './media-storage'));
        if (configService.get('NODE_ENV') === 'production' && driver === 'local') {
          const mount = configService.get<string>('RAILWAY_VOLUME_MOUNT_PATH') || configService.get<string>('MEDIA_PERSISTENT_VOLUME_ROOT');
          const relative = mount ? path.relative(path.resolve(mount), rootDir) : '..';
          if (!mount || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
            throw new Error('Production local media must be inside RAILWAY_VOLUME_MOUNT_PATH or MEDIA_PERSISTENT_VOLUME_ROOT. Alternatively configure S3/R2 storage.');
          }
        }
        const publicUrlPrefix = (
          configService.get<string>('STORAGE_PUBLIC_BASE_URL') ||
          configService.get<string>('MEDIA_S3_PUBLIC_URL') ||
          configService.get<string>('NEXT_PUBLIC_MEDIA_URL') ||
          configService.get<string>('MEDIA_PUBLIC_URL_PREFIX', 'http://localhost:4000/media/file')
        ).replace(/\/+$/, '');
        const maxSizeBytes = configService.get<number>('MEDIA_MAX_FILE_SIZE_BYTES', 10 * 1024 * 1024);

        const bucket = configService.get<string>('STORAGE_S3_BUCKET') || configService.get<string>('MEDIA_S3_BUCKET', '');
        const region = configService.get<string>('STORAGE_S3_REGION') || configService.get<string>('MEDIA_S3_REGION', 'auto');
        const endpoint = configService.get<string>('STORAGE_S3_ENDPOINT') || configService.get<string>('MEDIA_S3_ENDPOINT');
        const accessKeyId = configService.get<string>('STORAGE_S3_ACCESS_KEY') || configService.get<string>('MEDIA_S3_ACCESS_KEY_ID', '');
        const secretAccessKey = configService.get<string>('STORAGE_S3_SECRET_KEY') || configService.get<string>('MEDIA_S3_SECRET_ACCESS_KEY', '');
        const forcePathStyle = (
          configService.get<string>('STORAGE_S3_FORCE_PATH_STYLE') ||
          configService.get<string>('MEDIA_S3_FORCE_PATH_STYLE')
        ) === 'true';

        return StorageFactory.create({
          driver: driver as any,
          s3Config: driver === 'local' ? undefined : {
            bucket,
            region,
            endpoint,
            accessKeyId,
            secretAccessKey,
            publicUrlPrefix,
            forcePathStyle,
          },
          localConfig: {
            rootDir,
            publicUrlPrefix,
            maxSizeBytes,
          },
        });
      },
      inject: [ConfigService],
    },
    MediaService,
  ],
  exports: [MediaService, STORAGE_PROVIDER_TOKEN],
})
export class MediaModule {}
