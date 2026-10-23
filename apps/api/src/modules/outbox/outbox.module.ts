import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrderEmailWorker } from './order-email.worker';

@Global()
@Module({
  imports: [NotificationsModule],
  providers: [OutboxService, OrderEmailWorker],
  exports: [OutboxService],
})
export class OutboxModule {}
