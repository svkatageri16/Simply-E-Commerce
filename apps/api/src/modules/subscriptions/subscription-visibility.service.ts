import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { PrismaClient, StoreStatus, SubscriptionStatus, Store, Subscription } from '@prisma/client';
import {
  DomainException,
  StoreNotFoundException,
  StoreNotLiveException,
  StoreSuspendedException,
  StoreSubscriptionRequiredException,
  StoreSubscriptionExpiredException,
} from '../../common/exceptions/domain.exceptions';
import { ErrorCode } from '@simply/api-contracts';
import { AuthenticatedUser } from '@simply/types';

export interface StoreVisibilityResult {
  store: Store;
  subscription?: Subscription | null;
  isPreview: boolean;
}

@Injectable()
export class SubscriptionVisibilityService {
  private readonly logger = new Logger(SubscriptionVisibilityService.name);

  constructor(private readonly prisma: PrismaClient) {}

  /** Seller status uses the exact public gateway, including grace, tenant and publication rules. */
  public async getEffectivePublicStatus(storeId: string) {
    try {
      await this.evaluateVisibility(storeId);
      return { isPublic: true, requiresPayment: false, reason: null, evaluatedAt: new Date().toISOString() };
    } catch (error) {
      if (!(error instanceof DomainException)) throw error;
      const reason = (error.getResponse() as any).code as string;
      return { isPublic: false, requiresPayment: ['SUBSCRIPTION_REQUIRED', 'STORE_SUBSCRIPTION_EXPIRED'].includes(reason), reason, evaluatedAt: new Date().toISOString() };
    }
  }

  /**
   * Evaluates server-side store visibility according to critical subscription rules.
   * NEVER trust client state. Enforced strictly at backend gateway.
   */
  public async evaluateVisibility(
    storeSlugOrId: string,
    options?: {
      previewSecret?: string;
      authenticatedUser?: AuthenticatedUser | null;
    }
  ): Promise<StoreVisibilityResult> {
    const store = await this.prisma.store.findFirst({
      where: {
        OR: [{ slug: storeSlugOrId }, { id: storeSlugOrId }],
        deletedAt: null,
      },
      include: {
        tenant: {
          include: {
            subscriptions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!store) {
      throw new StoreNotFoundException(`Store "${storeSlugOrId}" not found.`);
    }

    if (store.status === StoreStatus.SUSPENDED || store.tenant.status === 'SUSPENDED') {
      throw new StoreSuspendedException('This service has been suspended by platform administration.');
    }

    if (store.status === StoreStatus.ARCHIVED || store.tenant.status === 'ARCHIVED') {
      throw new StoreNotLiveException('This store has been archived.');
    }

    const latestSubscription = store.tenant.subscriptions[0] || null;

    // Check 1: Private Seller / Admin Preview
    // A merchant owner or platform admin is allowed to preview their store, or with matching previewSecret UUID
    const isOwnerOrAdmin = Boolean(
      options?.authenticatedUser &&
      (options.authenticatedUser.isPlatformAdmin ||
        options.authenticatedUser.tenantId === store.tenantId)
    );

    const isSecretMatch = Boolean(
      options?.previewSecret &&
      store.previewSecret &&
      options.previewSecret === store.previewSecret
    );

    if (isOwnerOrAdmin || isSecretMatch) {
      return {
        store,
        subscription: latestSubscription,
        isPreview: true,
      };
    }

    // Check 2: Public Buyer Storefront Access
    // Store MUST NOT be publicly accessible unless active paid subscription exists and is unexpired
    if (!latestSubscription) {
      throw new StoreSubscriptionRequiredException(
        'Store is not publicly available. An active paid subscription is required to go live.'
      );
    }

    const now = new Date();

    if (latestSubscription.status !== SubscriptionStatus.ACTIVE) {
      if (
        latestSubscription.status === SubscriptionStatus.EXPIRED ||
        latestSubscription.status === SubscriptionStatus.PAST_DUE
      ) {
        throw new StoreSubscriptionExpiredException(
          'Store subscription has expired. Public access is temporarily paused until renewal.'
        );
      }
      throw new StoreSubscriptionRequiredException(
        `Store requires an active paid subscription (current subscription status: ${latestSubscription.status}).`
      );
    }

    // Check period end expiry with grace period from platform settings
    let gracePeriodMs = 0;
    try {
      const commerceSetting = await this.prisma.platformSetting.findUnique({
        where: { key: 'commerce' },
      });
      const graceDays = Number((commerceSetting?.value as any)?.subscriptionGracePeriodDays ?? 0);
      if (graceDays > 0) {
        gracePeriodMs = graceDays * 24 * 60 * 60 * 1000;
      }
    } catch {
      // Fallback: gracePeriodMs stays 0
    }

    const effectiveEnd = new Date(latestSubscription.currentPeriodEnd.getTime() + gracePeriodMs);
    if (now > effectiveEnd) {
      throw new StoreSubscriptionExpiredException(
        'Store subscription validity period has ended. Please renew to restore public access.'
      );
    }

    // Check store status
    if (store.status !== StoreStatus.LIVE || !store.isPubliclyAccessible) {
      throw new DomainException(
        ErrorCode.STORE_PRIVATE,
        'Store is currently configured in private preview mode by the seller.',
        HttpStatus.FORBIDDEN
      );
    }

    return {
      store,
      subscription: latestSubscription,
      isPreview: false,
    };
  }
}
