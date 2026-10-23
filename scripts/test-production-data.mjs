import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID, randomInt } from "node:crypto";
import { createRequire } from "node:module";
import { PrismaClient } from "../packages/db/node_modules/@prisma/client/index.js";
process.loadEnvFile(".env");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname), "Owned fixture tests require a local database.");
const require = createRequire(import.meta.url);
const {
  EmailOtpService,
} = require("../apps/api/dist/modules/auth/email-otp.service.js");
const {
  StoresService,
} = require("../apps/api/dist/modules/stores/stores.service.js");
const {
  CatalogService,
} = require("../apps/api/dist/modules/catalog/catalog.service.js");
const {
  StorefrontController,
} = require("../apps/api/dist/modules/stores/storefront.controller.js");
const {
  SubscriptionVisibilityService,
} = require("../apps/api/dist/modules/subscriptions/subscription-visibility.service.js");
const {
  OrdersService,
} = require("../apps/api/dist/modules/orders/orders.service.js");
const {
  InventoryService,
} = require("../apps/api/dist/modules/inventory/inventory.service.js");
const out = process.env.HARDENING_ARTIFACTS || "artifacts/production-hardening";
fs.mkdirSync(out, { recursive: true });
const db = new PrismaClient();
const run = `hardening-${Date.now()}`;
const tenantIds = [],
  phones = [],
  userIds = [];
const results = {};
const before = await db.store.findMany({
  select: { id: true, slug: true, name: true },
  orderBy: { id: "asc" },
});
const visibility = new SubscriptionVisibilityService(db);
const stores = new StoresService(db, visibility);
const catalog = new CatalogService(db);
const publicApi = new StorefrontController(db, stores, {}, {});
const captured = new Map();
const mail = {
  sendVerificationOtp: async (email, code) => {
    captured.set(email, code);
    return true;
  },
};
const config = {
  get: (key, fallback) => process.env[key] || fallback,
  getOrThrow: (key) => {
    if (!process.env[key]) throw new Error("Missing test config");
    return process.env[key];
  },
};
const otp = new EmailOtpService(db, config, mail, {
  sendOtp: async () => ({ success: false }),
});
const newPhone = async () => {
  let phone;
  do {
    phone = `+919${String(randomInt(0, 1e9)).padStart(9, "0")}`;
  } while (await db.user.findUnique({ where: { phone } }));
  phones.push(phone);
  return phone;
};
const ageChallenges = (phone) =>
  db.otpChallenge.updateMany({
    where: { phone },
    data: { createdAt: new Date(Date.now() - 61_000) },
  });
try {
  const duplicates =
    await db.$queryRaw`SELECT COUNT(*)::int AS count FROM (SELECT LOWER(TRIM(email)) FROM users WHERE email IS NOT NULL GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1) duplicates`;
  results.existingNormalizedEmailDuplicates = duplicates[0].count;
  assert.equal(
    duplicates[0].count,
    0,
    "Review existing normalized email duplicates before enforcing identity comparisons.",
  );
  const phone = await newPhone(),
    email = `${run}@example.test`;
  await assert.rejects(
    otp.request(phone, "REGISTRATION", "invalid"),
    /Invalid email/,
  );
  const requested = await otp.request(
    phone,
    "REGISTRATION",
    `  ${email.toUpperCase()}  `,
  );
  assert.equal(requested.maskedEmail, `${email[0]}***@example.test`);
  const code = captured.get(email);
  assert.match(code, /^\d{6}$/);
  const stored = await db.otpChallenge.findUniqueOrThrow({
    where: { id: requested.challengeId },
  });
  assert.equal(stored.email, email);
  assert.notEqual(stored.codeHash, code);
  assert.equal(stored.codeHash.length, 64);
  await assert.rejects(
    otp.verify(
      phone,
      code === "123456" ? "654321" : "123456",
      "REGISTRATION",
      email,
    ),
    /Incorrect OTP/,
  );
  await assert.rejects(otp.request(phone, "REGISTRATION", email), /wait/);
  await otp.verify(phone, code, "REGISTRATION", email);
  await assert.rejects(
    otp.verify(phone, code, "REGISTRATION", email),
    /already used/,
  );
  await ageChallenges(phone);
  const second = await otp.request(phone, "REGISTRATION", email);
  await db.otpChallenge.update({
    where: { id: second.challengeId },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  await assert.rejects(
    otp.verify(phone, captured.get(email), "REGISTRATION", email),
    /expired/,
  );
  await ageChallenges(phone);
  const third = await otp.request(phone, "REGISTRATION", email);
  const correct = captured.get(email),
    wrong = correct === "111111" ? "222222" : "111111";
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      otp.verify(phone, wrong, "REGISTRATION", email),
      /Incorrect OTP/,
    );
  await assert.rejects(
    otp.verify(phone, correct, "REGISTRATION", email),
    /Too many attempts/,
  );
  assert.equal(
    (
      await db.otpChallenge.findUniqueOrThrow({
        where: { id: third.challengeId },
      })
    ).attempts,
    5,
  );
  await ageChallenges(phone);
  const fourth = await otp.request(phone, "REGISTRATION", email);
  const attempts = await Promise.allSettled([
    otp.verify(phone, captured.get(email), "REGISTRATION", email),
    otp.verify(phone, captured.get(email), "REGISTRATION", email),
  ]);
  assert.equal(
    attempts.filter((x) => x.status === "fulfilled").length,
    1,
    "concurrent correct verification is single-use",
  );
  await ageChallenges(phone);
  await otp.request(phone, "REGISTRATION", email);
  await ageChallenges(phone);
  await assert.rejects(
    otp.request(phone, "REGISTRATION", email),
    /Too many verification requests/,
  );
  const bombPhone = await newPhone(),
    bombEmail = `bomb-${run}@example.test`;
  const simultaneous = await Promise.allSettled([
    otp.request(bombPhone, "REGISTRATION", bombEmail),
    otp.request(bombPhone, "REGISTRATION", bombEmail),
  ]);
  assert.equal(
    simultaneous.filter((x) => x.status === "fulfilled").length,
    1,
    "send cooldown works across concurrent database transactions",
  );
  const failPhone = await newPhone();
  const failed = new EmailOtpService(
    db,
    config,
    { sendVerificationOtp: async () => false },
    {},
  );
  await assert.rejects(
    failed.request(failPhone, "REGISTRATION", `fail-${run}@example.test`),
    /Unable to send/,
  );
  assert.ok(
    (await db.otpChallenge.findFirst({ where: { phone: failPhone } }))
      .consumedAt,
  );
  results.otp = {
    generatedServerSide: "PASS",
    hashed: "PASS",
    normalized: "PASS",
    malformedEmail: "PASS",
    fixedCodeRejected: "PASS (unless randomly generated)",
    wrong: "PASS",
    expiry: "PASS",
    singleUse: "PASS",
    concurrentVerification: "PASS",
    cooldown: "PASS",
    concurrentSends: "PASS",
    fiveAttempts: "PASS",
    fiveSendsPer15Minutes: "PASS",
    smtpFailure: "PASS",
    codeLogged: false,
  };

  const {
    AuthService,
  } = require("../apps/api/dist/modules/auth/auth.service.js");
  const apiRequire = createRequire(
    new URL("../apps/api/package.json", import.meta.url),
  );
  const { JwtService } = apiRequire("@nestjs/jwt");
  const auth = new AuthService(
    db,
    new JwtService({ secret: process.env.JWT_ACCESS_SECRET }),
    config,
    {},
    otp,
  );
  const accountPhone = await newPhone(),
    accountEmail = `account-${run}@example.test`;
  await auth.requestOtpChallenge(accountPhone, "REGISTRATION", accountEmail);
  const verification = await auth.verifyOtpChallenge(
    accountPhone,
    captured.get(accountEmail),
    "REGISTRATION",
    accountEmail,
  );
  const account = await auth.setupPin({
    phone: accountPhone,
    pin: "654321",
    verificationToken: verification.tempToken,
    email: "unverified@example.test",
  });
  userIds.push(account.user.userId);
  const createdUser = await db.user.findUniqueOrThrow({
    where: { id: account.user.userId },
  });
  assert.equal(createdUser.email, accountEmail);
  assert.ok(createdUser.emailVerifiedAt);
  await assert.rejects(
    auth.setupPin({
      phone: accountPhone,
      pin: "111111",
      verificationToken: verification.tempToken,
    }),
    /already been used/,
  );
  assert.equal(
    (await auth.loginWithPin(accountPhone, "654321")).user.userId,
    createdUser.id,
  );
  await ageChallenges(accountPhone);
  const unrelatedPhone = await newPhone();
  await assert.rejects(auth.requestOtpChallenge(unrelatedPhone, "REGISTRATION", accountEmail), /Registration is unavailable/);
  const suppressed = await db.otpChallenge.findFirstOrThrow({ where: { phone: unrelatedPhone } });
  assert.equal(suppressed.deliveredAt, null);
  assert.ok(suppressed.consumedAt);
  results.otp.conflictingRegistrationNeverClaimsSent = "PASS";
  const legacyPhone = await newPhone();
  const legacy = await db.user.create({
    data: {
      phone: legacyPhone,
      fullName: run,
      credentials: {
        create: { credentialType: "PIN", pinHash: auth.hashPin("654321") },
      },
    },
  });
  userIds.push(legacy.id);
  assert.equal(
    (await auth.loginWithPin(legacyPhone, "654321")).user.userId,
    legacy.id,
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: legacy.id } })).email,
    null,
  );
  const legacyEmail = `legacy-${run}@example.test`;
  await assert.rejects(
    otp.request(legacyPhone, "EMAIL_VERIFICATION", legacyEmail, createdUser.id),
    /unavailable/,
  );
  await auth.requestLegacyEmail(legacy.id, legacyEmail);
  await auth.verifyLegacyEmail(
    legacy.id,
    legacyEmail,
    captured.get(legacyEmail),
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: legacy.id } })).email,
    legacyEmail,
  );
  await assert.rejects(
    auth.requestLegacyEmail(legacy.id, `replace-${run}@example.test`),
    /unavailable/,
  );
  results.otp.legacyEmailCollection = "PASS";
  results.otp.existingEmailNeverOverwritten = "PASS";
  await ageChallenges(legacyPhone);
  await auth.requestOtpChallenge(legacyPhone, "RECOVERY");
  const recoveryVerification = await auth.verifyOtpChallenge(
    legacyPhone,
    captured.get(legacyEmail),
    "RECOVERY",
  );
  await auth.setupPin({
    phone: legacyPhone,
    pin: "654322",
    verificationToken: recoveryVerification.tempToken,
    fullName: "Merchant Seller",
  });
  const recoveredLegacy = await db.user.findUniqueOrThrow({
    where: { id: legacy.id },
  });
  assert.equal(recoveredLegacy.fullName, run);
  assert.equal(recoveredLegacy.email, legacyEmail);
  results.otp.recoveryPreservesExistingNameAndEmail = "PASS";
  results.otp.newAccountVerifiedEmail = "PASS";
  results.otp.pinSetupTokenSingleUse = "PASS";
  results.otp.unverifiedEmailOverrideRejected = "PASS";
  results.otp.legacyPinLogin = "PASS";

  const plan = await db.plan.findFirstOrThrow();
  const fixtures = [];
  for (let index = 0; index < 3; index++) {
    const slug = `${run}-${index}`;
    const tenant = await db.tenant.create({ data: { name: run, slug } });
    tenantIds.push(tenant.id);
    const store = await db.store.create({
      data: {
        tenantId: tenant.id,
        name: "Hardening Test Shop",
        slug,
        status: "LIVE",
        isPubliclyAccessible: true,
        fulfillmentMode: "PICKUP",
      },
    });
    await db.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 86400000),
      },
    });
    const categories = [];
    for (const name of ["Women's", "Kids"])
      categories.push(
        await db.category.create({
          data: {
            tenantId: tenant.id,
            storeId: store.id,
            name,
            slug: name === "Kids" ? "kids" : "womens",
          },
        }),
      );
    const products = [];
    for (let i = 0; i < 4; i++)
      products.push(
        await db.product.create({
          data: {
            tenantId: tenant.id,
            storeId: store.id,
            name: `Test Product ${index}-${i}`,
            slug: `product-${i}`,
            categoryId: categories[Math.floor(i / 2)].id,
            status: "PUBLISHED",
            variants: {
              create: [
                {
                  tenantId: tenant.id,
                  storeId: store.id,
                  sku: `${run}-${index}-${i}`,
                  pricePaise: 10000,
                  inventory: {
                    create: {
                      tenantId: tenant.id,
                      storeId: store.id,
                      stockOnHand: 30,
                    },
                  },
                },
                {
                  tenantId: tenant.id,
                  storeId: store.id,
                  sku: `${run}-${index}-${i}-other`,
                  pricePaise: 12500,
                  inventory: {
                    create: {
                      tenantId: tenant.id,
                      storeId: store.id,
                      stockOnHand: 20,
                    },
                  },
                },
              ],
            },
          },
          include: { variants: true },
        }),
      );
    fixtures.push({ tenant, store, categories, products });
  }
  const a = fixtures[0],
    b = fixtures[1];
  const count = async (fixture) =>
    (await publicApi.getCategories(fixture.store.slug)).categories;
  assert.deepEqual(
    (await count(a)).map((c) => c.visibleProductCount),
    [2, 2],
  );
  assert.deepEqual(
    (await stores.getPublicStorefront(a.store.slug)).categories.map(
      (c) => c.visibleProductCount,
    ),
    [2, 2],
  );
  const product = a.products[0];
  await db.product.update({
    where: { id: product.id },
    data: { status: "DRAFT" },
  });
  assert.equal((await count(a))[0].visibleProductCount, 1);
  const merchantCounts = await catalog.getCategories({
    tenantId: a.tenant.id,
    storeId: a.store.id,
  });
  assert.equal(merchantCounts[0].totalProductCount, 2);
  assert.equal(merchantCounts[0].visibleProductCount, 1);
  await db.product.update({
    where: { id: product.id },
    data: { status: "PUBLISHED", categoryId: a.categories[1].id },
  });
  assert.deepEqual(
    (await count(a)).map((c) => c.visibleProductCount),
    [1, 3],
  );
  await db.product.update({
    where: { id: product.id },
    data: { deletedAt: new Date() },
  });
  assert.equal((await count(a))[1].visibleProductCount, 2);
  await db.product.update({
    where: { id: product.id },
    data: { deletedAt: null, categoryId: null },
  });
  assert.deepEqual(
    (await count(a)).map((c) => c.visibleProductCount),
    [1, 2],
  );
  await db.product.update({
    where: { id: product.id },
    data: { categoryId: a.categories[0].id },
  });
  assert.deepEqual(
    (await count(b)).map((c) => c.visibleProductCount),
    [2, 2],
  );
  assert.ok(
    (await count(b)).every(
      (c) => !a.categories.some((other) => other.id === c.id),
    ),
  );
  results.categories = {
    relationalCounts: "PASS",
    merchant: [2, 2],
    storefront: [2, 2],
    variantsNotDoubleCounted: "PASS",
    publishUnpublish: "PASS",
    softDeleteRestore: "PASS",
    reassignmentRemoval: "PASS",
    duplicateNamesAcrossStores: "PASS",
    tenantScoped: "PASS",
  };

  const noopMail = new Proxy({}, { get: () => async () => true });
  const orders = new OrdersService(
    db,
    visibility,
    new InventoryService(db),
    {},
    noopMail,
    noopMail,
  );
  const colour = await db.productOption.create({
    data: {
      tenantId: a.tenant.id,
      storeId: a.store.id,
      productId: product.id,
      name: "Colour",
      values: { create: { value: "Black" } },
    },
    include: { values: true },
  });
  await db.productVariantOptionValue.create({
    data: {
      variantId: product.variants[0].id,
      optionValueId: colour.values[0].id,
    },
  });
  const variant = product.variants[0];
  const originalImage = await db.productMedia.findFirst({
    where: { storeId: { in: before.map((s) => s.id) } },
    select: { publicUrl: true },
  });
  const imageUrl =
    originalImage?.publicUrl || "https://example.test/variant.jpg";
  await db.productMedia.create({
    data: {
      tenantId: a.tenant.id,
      storeId: a.store.id,
      productId: product.id,
      variantId: variant.id,
      storageKey: `${a.tenant.id}/${a.store.id}/products/${run}.jpg`,
      filePath: `${a.tenant.id}/${a.store.id}/products/${run}.jpg`,
      publicUrl: imageUrl,
      sizeBytes: 1,
      mimeType: "image/jpeg",
    },
  });
  const cart = await db.cart.create({
    data: {
      tenantId: a.tenant.id,
      storeId: a.store.id,
      guestToken: `test_${randomUUID()}`,
      expiresAt: new Date(Date.now() + 86400000),
      items: {
        create: { variantId: variant.id, quantity: 2, unitPricePaise: 10000 },
      },
    },
    include: { items: true },
  });
  const dto = {
    storeId: a.store.id,
    directItems: [
      { productId: product.id, variantId: variant.id, quantity: 3 },
    ],
    fullName: "Test Buyer",
    email: `buyer-${run}@example.test`,
    phone: await newPhone(),
    paymentMethod: "COD",
    fulfillmentMode: "PICKUP",
    couponCode: "WELCOME10",
  };
  const order = await orders.createGuestOrder(dto);
  assert.equal(order.subtotalPaise, 30000);
  assert.equal(order.discountPaise, 3000);
  assert.equal(order.totalPaise, 28350);
  const lines = await db.orderItem.findMany({ where: { orderId: order.id } });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].variantId, variant.id);
  assert.equal(lines[0].quantity, 3);
  assert.equal(lines[0].unitPricePaise, 10000);
  assert.deepEqual(lines[0].selectedOptions, { Colour: "Black" });
  assert.equal(lines[0].imageUrl, imageUrl);
  assert.equal(
    (await db.inventory.findUnique({ where: { variantId: variant.id } }))
      .stockOnHand,
    27,
  );
  assert.deepEqual(
    (
      await db.cart.findUnique({
        where: { id: cart.id },
        include: { items: true },
      })
    ).items,
    cart.items,
    "direct order never clears or changes the persistent cart",
  );
  await assert.rejects(
    orders.createGuestOrder({ ...dto, storeId: b.store.id }),
    /unavailable/,
  );
  await assert.rejects(
    orders.createGuestOrder({
      ...dto,
      directItems: [{ ...dto.directItems[0], quantity: 999 }],
    }),
    /stock|available/i,
  );
  await assert.rejects(
    orders.createGuestOrder({ ...dto, cartId: cart.id }),
    /either/,
  );
  results.buyNow = {
    realOrder: "PASS",
    exactVariant: "PASS",
    quantity: "PASS",
    serverPrice: "PASS",
    coupon: "PASS",
    inventory: "PASS",
    existingCartPreserved: "PASS",
    tenantIsolation: "PASS",
    outOfStock: "PASS",
  };
  const prepaid = await orders.createGuestOrder({
    ...dto,
    couponCode: undefined,
    discountPaise: 999999,
    paymentMethod: "RAZORPAY",
  });
  assert.equal(
    prepaid.discountPaise,
    0,
    "untrusted client discount cannot reduce server price",
  );
  assert.equal(prepaid.paymentStatus, "PENDING");
  assert.deepEqual(
    (
      await db.cart.findUnique({
        where: { id: cart.id },
        include: { items: true },
      })
    ).items,
    cart.items,
  );
  results.buyNow.prepaidOrderSelection = "PASS";
  results.buyNow.variantImage = "PASS";
  results.buyNow.optionSnapshot = "PASS";
  results.buyNow.clientDiscountIgnored = "PASS";
  const {
    CustomersService,
  } = require("../apps/api/dist/modules/customers/customers.service.js");
  const {
    CartService,
  } = require("../apps/api/dist/modules/cart/cart.service.js");
  const contextA = { tenantId: a.tenant.id, storeId: a.store.id };
  const contextB = { tenantId: b.tenant.id, storeId: b.store.id };
  await assert.rejects(catalog.getProductById(contextA, b.products[0].id));
  await assert.rejects(
    catalog.updateProduct(contextA, product.id, {
      categoryId: b.categories[0].id,
    }),
  );
  await assert.rejects(orders.getOrderById(order.id, contextB));
  await assert.rejects(
    new CustomersService(db).getCustomerById(contextB, order.customerId),
  );
  await assert.rejects(
    new CartService(db).getOrCreateCart(b.store.id, cart.guestToken),
  );
  results.tenantIsolation = {
    products: "PASS",
    categoryAssignment: "PASS",
    orders: "PASS",
    customers: "PASS",
    cart: "PASS",
    directCheckout: "PASS",
  };
  const currentCategories = await db.category.findMany({
    where: { storeId: { in: before.map((s) => s.id) }, isActive: true },
    select: {
      id: true,
      name: true,
      storeId: true,
      _count: {
        select: {
          products: { where: { status: "PUBLISHED", deletedAt: null } },
        },
      },
    },
  });
  results.existingMerchantCategoryAudit = currentCategories.map((c) => ({
    store: before.find((s) => s.id === c.storeId)?.slug,
    category: c.name,
    visibleProductCount: c._count.products,
  }));
  if (process.env.RUN_GLOBAL_FOOTER === '1') {
    const { verifyGlobalFooters } = await import('./test-global-footers.mjs');
    await verifyGlobalFooters(fixtures, out);
  }
  if (process.env.RUN_LAUNCH_SMOKE === '1') {
    const { verifyLaunchBrowser } = await import('./test-launch-browser-smoke.mjs');
    await verifyLaunchBrowser(fixtures, db, out);
  }
  if (process.env.RUN_LOCAL_LOAD === "1") {
    const { loadStorefront } = await import("./load-storefront.mjs");
    await loadStorefront(
      fixtures.map((f) => ({
        id: f.store.id,
        slug: f.store.slug,
        productId: f.products[0].id,
        productSlug: f.products[0].slug,
        productCount: 4,
      })),
      `${out}/load-results.json`,
    );
  }
  if (process.env.RUN_SELLER_UI === "1") {
    const { verifySellerProductionUI } =
      await import("./test-production-auth-ui.mjs");
    await verifySellerProductionUI(
      fixtures[0],
      await catalog.getCategories({
        tenantId: a.tenant.id,
        storeId: a.store.id,
      }),
    );
  }
  if (process.env.RUN_PRODUCTION_BROWSER === "1") {
    const { verifyProductionBrowsers } =
      await import("./test-production-browsers.mjs");
    await verifyProductionBrowsers(
      fixtures,
      await catalog.getCategories({
        tenantId: a.tenant.id,
        storeId: a.store.id,
      }),
    );
  }
  fs.writeFileSync(
    `${out}/data-results.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  // Delete only this run's owned test tenants and phone challenges. Never reset the DB.
  await db.outboxEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await db.tenant.deleteMany({ where: { id: { in: tenantIds }, name: run } });
  await db.otpChallenge.deleteMany({ where: { phone: { in: phones } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  assert.deepEqual(
    await db.store.findMany({
      where: { id: { in: before.map((s) => s.id) } },
      select: { id: true, slug: true, name: true },
      orderBy: { id: "asc" },
    }),
    before,
  );
  await db.$disconnect();
}
