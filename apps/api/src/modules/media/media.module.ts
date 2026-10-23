import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaService, STORAGE_PROVIDER_TOKEN } from './media.service';
import { MediaController } from './media.controller';
import { StorageFactory } from '@simply/storage';
import { localMediaRoot } from './local-media-root';

@Global()
@Module({
  controllers: [MediaController],
  providers: [
    {
      provide: STORAGE_PROVIDER_TOKEN,
      useFactory: (configService: ConfigService) => {
        const driver = configService.get<string>('MEDIA_STORAGE_PROVIDER') || configService.get<string>('MEDIA_STORAGE_DRIVER', 'local');
        if (configService.get('NODE_ENV') === 'production' && driver === 'local')
          throw new Error('Production merchant media requires MEDIA_STORAGE_PROVIDER=s3 and durable object storage configuration. Legacy local files may still be served from MEDIA_STORAGE_LOCAL_ROOT.');
        const rootDir = localMediaRoot(configService.get<string>('MEDIA_STORAGE_LOCAL_ROOT', './media-storage'));
        const publicUrlPrefix = configService.get<string>('MEDIA_PUBLIC_URL_PREFIX', 'http://localhost:4000/media/file');
        const maxSizeBytes = configService.get<number>('MEDIA_MAX_FILE_SIZE_BYTES', 10 * 1024 * 1024);

        return StorageFactory.create({
          driver: driver as any,
          s3Config: driver === 'local' ? undefined : {
            bucket: configService.get<string>('MEDIA_S3_BUCKET', ''),
            region: configService.get<string>('MEDIA_S3_REGION', 'auto'),
            endpoint: configService.get<string>('MEDIA_S3_ENDPOINT'),
            accessKeyId: configService.get<string>('MEDIA_S3_ACCESS_KEY_ID'),
            secretAccessKey: configService.get<string>('MEDIA_S3_SECRET_ACCESS_KEY'),
            publicUrlPrefix: configService.get<string>('MEDIA_S3_PUBLIC_URL', ''),
            forcePathStyle: configService.get<string>('MEDIA_S3_FORCE_PATH_STYLE') === 'true',
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
