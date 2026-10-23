import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@simply/types';
import { AdminService } from '../../src/modules/admin/admin.service';
import { AdminDataService } from '../../src/modules/admin/admin-data.service';
import { AdminController } from '../../src/modules/admin/admin.controller';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { SubscriptionService } from '../../src/modules/subscriptions/subscription.service';

describe('Admin package definitions: real database and controller role policy', () => {
  const db = new PrismaClient(), run = randomUUID();
  const actor = `owned-admin-${run}`;
  const data = new AdminDataService(db, {} as any);
  const admin = new AdminService(db, {} as any, data, {} as any, {} as any, {} as any);
  let planId: string;
  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { actorId: actor } });
    if (planId) await db.plan.delete({ where: { id: planId } });
    await db.$disconnect();
  });

  it('persists admin name, description, features, GST, availability, order and badge; public API follows each change', async () => {
    const plan = await admin.createPlan({ name: 'Owned Admin Package', code: `OWNED_${run.replace(/-/g, '_')}`, description: 'Owned description', pricePaise: 299900, gstBasisPoints: 1800, status: 'COMING_SOON', displayOrder: 8, badge: 'Coming Soon', isPublic: true, isPurchasable: false, features: ['Owned feature'], highlights: [{ text: 'Owned highlight', sortOrder: 0 }] } as any, actor);
    expect(plan).not.toBeNull();
    planId = plan!.id;
    const subscriptions = new SubscriptionService(db);
    let published = (await subscriptions.getAvailablePlans()).find(p => p.id === planId)!;
    expect(published).toMatchObject({ name: 'Owned Admin Package', description: 'Owned description', status: 'COMING_SOON', purchasable: false, totalPaise: 353882, features: ['Owned feature'], badge: 'Coming Soon', displayOrder: 8 });
    await admin.updatePlan(planId, { name: 'Updated Package', status: 'ACTIVE', isPurchasable: true, gstBasisPoints: 500, displayOrder: 0, badge: 'Available', highlights: [{ text: 'Updated feature', sortOrder: 0 }] }, actor);
    published = (await subscriptions.getAvailablePlans()).find(p => p.id === planId)!;
    expect(published).toMatchObject({ name: 'Updated Package', purchasable: true, totalPaise: 314895, displayOrder: 0 });
    expect(published.highlights[0].text).toBe('Updated feature');
    await admin.updatePlan(planId, { status: 'CONTACT_SALES', isPurchasable: false }, actor);
    expect((await subscriptions.getAvailablePlans()).find(p => p.id === planId)).toMatchObject({ purchasable: false, availability: 'CONTACT' });
    await admin.updatePlan(planId, { isPublic: false }, actor);
    expect((await subscriptions.getAvailablePlans()).some(p => p.id === planId)).toBe(false);
  });

  it('denies a normal merchant every package mutation using the actual controller role metadata', () => {
    const guard = new RolesGuard(new Reflector(), db);
    for (const method of ['createPlan', 'updatePlan', 'deletePlan']) {
      const context = (role: UserRole) => ({ getHandler: () => (AdminController.prototype as any)[method], getClass: () => AdminController, switchToHttp: () => ({ getRequest: () => ({ user: { role, isPlatformAdmin: role === UserRole.PLATFORM_ADMIN, isSuperAdmin: role === UserRole.PLATFORM_ADMIN } }) }) });
      expect(() => guard.canActivate(context(UserRole.SELLER_OWNER) as any)).toThrow();
      expect(guard.canActivate(context(UserRole.PLATFORM_ADMIN) as any)).toBe(true);
    }
  });
});
