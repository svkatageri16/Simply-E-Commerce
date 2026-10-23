import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, OutboxStatus } from '@prisma/client';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaClient) {}
  private readonly handlers = new Map<string, (event: any) => Promise<void>>();
  public registerHandler(eventType: string, handler: (event: any) => Promise<void>) {
    this.handlers.set(eventType, handler);
  }

  public async emitEvent(
    eventType: string,
    payload: any,
    tenantId?: string,
    storeId?: string,
    maxRetries = 5
  ) {
    return this.prisma.outboxEvent.create({
      data: {
        eventType,
        payload,
        tenantId,
        storeId,
        status: OutboxStatus.PENDING,
        maxRetries,
        retryCount: 0,
      },
    });
  }

  /**
   * Processes pending outbox events with exponential backoff and error recovery.
   * Guarantees that external integration calls (e.g. Shiprocket, email notifications)
   * never block customer payment transactions or lose events.
   */
  public async processPendingEvents(limit = 10): Promise<{ processed: number; failed: number }> {
    if (!this.handlers.size) return { processed: 0, failed: 0 };
    const now = new Date();

    const pendingEvents = await this.prisma.outboxEvent.findMany({
      where: {
        eventType: { in: [...this.handlers.keys()] },
        OR: [
          { status: OutboxStatus.PENDING, OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
          { status: OutboxStatus.PROCESSING, nextRetryAt: { lte: now } },
        ],
      },
      take: Math.max(1, Math.min(50, limit)),
      orderBy: { createdAt: 'asc' },
    });

    let processedCount = 0;
    let failedCount = 0;

    for (const event of pendingEvents) {
      try {
        if (event.retryCount >= event.maxRetries) {
          await this.prisma.outboxEvent.update({ where: { id: event.id }, data: { status: OutboxStatus.DEAD_LETTER } });
          continue;
        }
        const claimed = await this.prisma.outboxEvent.updateMany({
          where: { id: event.id, status: event.status, retryCount: event.retryCount, nextRetryAt: event.nextRetryAt },
          data: { status: OutboxStatus.PROCESSING, retryCount: { increment: 1 }, nextRetryAt: new Date(Date.now() + 60_000) },
        });
        if (!claimed.count) continue;

        // Event handler execution
        await this.handlers.get(event.eventType)!(event);

        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.COMPLETED,
            processedAt: new Date(),
          },
        });

        processedCount++;
      } catch (err: any) {
        failedCount++;
        const nextRetry = event.retryCount + 1;
        const isDeadLetter = nextRetry >= event.maxRetries;

        // Exponential backoff: 2^retry * 10 seconds
        const backoffSeconds = Math.pow(2, nextRetry) * 10;
        const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);

        this.logger.warn(`[OUTBOX EVENT FAILURE] Event ${event.id} failed attempt ${nextRetry}/${event.maxRetries}.`);

        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: isDeadLetter ? OutboxStatus.DEAD_LETTER : OutboxStatus.PENDING,
            retryCount: nextRetry,
            lastError: 'Delivery failed; retry scheduled where available.',
            nextRetryAt: isDeadLetter ? null : nextRetryAt,
          },
        });
      }
    }

    return { processed: processedCount, failed: failedCount };
  }
}
