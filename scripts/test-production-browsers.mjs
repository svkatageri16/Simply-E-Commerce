import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, firefox, webkit } from "playwright";
import { createTranslator } from "../packages/i18n/dist/index.js";
const out = process.env.HARDENING_ARTIFACTS || "artifacts/production-hardening";
const base = process.env.STOREFRONT_URL || "http://localhost:3000";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname),
  "Use a local storefront for fixture tests.",
);
// Explicit CORS keeps intercepted API responses valid in every browser engine.
const fulfill = (route, options) =>
  route.fulfill({
    ...options,
    headers: {
      "access-control-allow-origin": new URL(base).origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers":
        route.request().headers()["access-control-request-headers"] ||
        "content-type,authorization",
      ...options.headers,
    },
  });
const engines = [
  ["Chrome", chromium, { channel: "chrome" }],
  ["Edge", chromium, { channel: "msedge" }],
  ["Firefox", firefox, {}],
  ["WebKit", webkit, {}],
];
const image =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#cedada"/></svg>',
  );
export const product = {
  id: "direct-product",
  name: "Direct Buy Shirt",
  slug: "direct-shirt",
  status: "PUBLISHED",
  mode: "SELL_ONLINE",
  media: [{ id: "image", publicUrl: image }],
  options: [
    {
      id: "colour",
      name: "Colour",
      values: [
        { id: "black", value: "Black" },
        { id: "white", value: "White" },
      ],
    },
    {
      id: "size",
      name: "Size",
      values: [
        { id: "small", value: "S" },
        { id: "large", value: "L" },
      ],
    },
  ],
  variants: [
    ["black-small", "Black", "S"],
    ["white-large", "White", "L"],
  ].map(([id, colour, size]) => ({
    id,
    sku: id,
    title: colour + " / " + size,
    status: "ACTIVE",
    pricePaise: 129900,
    inventory: { stockOnHand: 100, availableQuantity: 100 },
    optionValues: [
      {
        optionValue: {
          value: colour,
          option: { name: "Colour", sortOrder: 0 },
        },
      },
      { optionValue: { value: size, option: { name: "Size", sortOrder: 1 } } },
    ],
  })),
};
export const fixture = {
  store: {
    id: "direct-test-store",
    slug: "direct-test-shop",
    name: "Direct Test Shop",
    status: "LIVE",
    storefrontDefaultLocale: "en-IN",
    enabledStorefrontLocales: ["en-IN", "mr-IN", "hi-IN"],
    branding: {},
    fulfillmentMode: "PICKUP",
    paymentSettings: { codEnabled: true },
    shippingSettings: { flatRatePaise: 0 },
  },
  products: [product],
  categories: [],
  themeConfig: { themeId: "aura" },
};
export async function verifyProductionBrowsers(fixtures, merchantCategories) {
  const results = [];
  for (const [browserName, engine, options] of engines) {
    const browser = await engine.launch({ headless: true, ...options });
    try {
      // Actual persisted category data, fresh no-login context; all four engines.
      const realContext = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const realPage = await realContext.newPage();
      await realPage.goto(`${base}/store/${fixtures[0].store.slug}`, {
        waitUntil: "networkidle",
      });
      for (const category of ["Women's", "Kids"])
        assert.match(
          await realPage
            .getByRole("button", { name: new RegExp(category + " 2") })
            .innerText(),
          /2/,
        );
      await realPage.screenshot({
        path: `${out}/${browserName}-collection-counts.png`,
        fullPage: true,
      });
      await realContext.close();
      for (const locale of ["en-IN", "mr-IN", "hi-IN"])
        for (const width of [1440, 390])
          for (const existing of [false, true]) {
            const context = await browser.newContext({
              viewport: { width, height: width === 390 ? 844 : 900 },
            });
            let mutations = 0,
              placed = null;
            const errors = [];
            const normalItems = existing
              ? [
                  {
                    id: "existing-line",
                    variantId: "existing-variant",
                    quantity: 2,
                    unitPricePaise: 5000,
                    variant: {
                      id: "existing-variant",
                      pricePaise: 5000,
                      sku: "existing",
                      product: {
                        id: "existing-product",
                        name: "Existing Cart Product",
                        media: [{ publicUrl: image }],
                      },
                    },
                  },
                ]
              : [];
            const persistent = {
              id: "existing-cart",
              storeId: fixture.store.id,
              items: normalItems,
              subtotalPaise: existing ? 10000 : 0,
            };
            await context.route("http://localhost:4000/**", async (route) => {
              const url = new URL(route.request().url());
              if (route.request().method() === "OPTIONS")
                return fulfill(route, { status: 204 });
              if (url.pathname === "/orders/checkout") {
                placed = route.request().postDataJSON();
                assert.deepEqual(placed.directItems, [
                  {
                    productId: product.id,
                    variantId: "white-large",
                    quantity: 3,
                  },
                ]);
                assert.equal(placed.cartId, undefined);
                return fulfill(route, {
                  json: {
                    success: true,
                    data: {
                      id: "direct-order",
                      orderNumber: "DIRECT-TEST",
                      trackingToken: "test",
                    },
                  },
                });
              }
              if (url.pathname.startsWith("/storefront/"))
                return fulfill(route, {
                  json: {
                    success: true,
                    data: {
                      ...fixture,
                      store: {
                        ...fixture.store,
                        storefrontDefaultLocale: locale,
                      },
                      product,
                    },
                  },
                });
              if (url.pathname === "/cart/init")
                return fulfill(route, {
                  json: {
                    success: true,
                    data: {
                      ...persistent,
                      guestToken: route.request().postDataJSON().guestToken,
                    },
                  },
                });
              if (url.pathname.startsWith("/cart/")) {
                if (route.request().method() !== "GET") mutations++;
                return fulfill(route, {
                  json: { success: true, data: persistent },
                });
              }
              return fulfill(route, {
                json: {
                  success: true,
                  data: {
                    reviews: [],
                    totalReviews: 0,
                    averageRating: 0,
                    distribution: {},
                  },
                },
              });
            });
            const page = await context.newPage();
            page.on("pageerror", (e) => errors.push(e.message));
            const productUrl = `${base}/store/${fixture.store.slug}/product/${product.id}`;
            const choose = async () => {
              await page
                .getByRole("button", { name: "White", exact: true })
                .click();
              await page
                .getByRole("button", { name: "L", exact: true })
                .click();
              await page.locator("button:has(svg.lucide-plus)").first().click();
              await page.locator("button:has(svg.lucide-plus)").first().click();
            };
            const buy = async () => {
              await page
                .locator('[data-testid="buy-now-button"]:visible')
                .first()
                .click();
              await page.waitForURL("**/checkout?direct=*");
              // The product name is already present on the previous page. Wait for
              // checkout itself before inspecting variant details or navigating back.
              await page.getByTestId("place-order-button").waitFor();
              await page.waitForLoadState("networkidle");
              await page
                .getByText(product.name, { exact: true })
                .first()
                .waitFor();
            };
            await page.goto(productUrl, { waitUntil: "networkidle" });
            await choose();
            await buy();
            assert.ok(
              !/\b(fullName|mobileNumber|placeOrder|totalAmount|onlinePayment|contactInfo|paymentMethod)\b/.test(
                await page.locator("body").innerText(),
              ),
              "checkout renders translated labels rather than keys",
            );
            assert.match(await page.locator("body").innerText(), /White/);
            assert.match(await page.locator("body").innerText(), /L/);
            assert.ok(
              !(await page.locator("body").innerText()).includes(
                "Existing Cart Product",
              ),
              "checkout only has direct item",
            );
            assert.equal(mutations, 0);
            await page.goBack({ waitUntil: "networkidle" });
            assert.equal(mutations, 0);
            await choose();
            await buy();
            // Cancel by returning to the normal cart; the direct item must never be there.
            await page
              .locator(`a[href="/store/${fixture.store.slug}/cart"]:visible`)
              .first()
              .click();
            await page.waitForURL("**/cart");
            if (existing)
              await page
                .getByText("Existing Cart Product", { exact: true })
                .first()
                .waitFor();
            else
              await page
                .getByRole("heading", {
                  name: createTranslator(locale)("storefront.emptyCart"),
                  exact: true,
                })
                .waitFor();
            assert.ok(
              !(await page.locator("body").innerText()).includes(product.name),
            );
            assert.equal(mutations, 0);
            await page.goto(productUrl, { waitUntil: "networkidle" });
            await choose();
            await buy();
            if (
              browserName === "Chrome" &&
              locale === "en-IN" &&
              width === 390 &&
              existing
            )
              await page.screenshot({
                path: `${out}/buy-now-direct-checkout.png`,
                fullPage: true,
              });
            await page.getByPlaceholder("e.g. Anand Sharma").fill("Test Buyer");
            await page.getByPlaceholder("9876543210").fill("9876543210");
            await page.getByTestId('checkout-email-input').fill('buyer@example.test');
            await page.getByTestId("place-order-button").click();
            await page.waitForURL("**/order/DIRECT-TEST*");
            assert.ok(placed);
            assert.equal(mutations, 0);
            await page.goto(`${base}/store/${fixture.store.slug}/cart`, {
              waitUntil: "networkidle",
            });
            if (existing)
              await page
                .getByText("Existing Cart Product", { exact: true })
                .first()
                .waitFor();
            else
              await page
                .getByRole("heading", {
                  name: createTranslator(locale)("storefront.emptyCart"),
                  exact: true,
                })
                .waitFor();
            assert.equal(mutations, 0);
            assert.deepEqual(normalItems, persistent.items);
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
              ),
              false,
            );
            assert.deepEqual(errors, []);
            results.push({
              browser: browserName,
              locale,
              width,
              initialCart: existing ? "two items" : "empty",
              buyNow: "PASS",
              exactVariant: "PASS",
              quantity: 3,
              backCancel: "PASS",
              checkout: "PASS",
              cartMutations: mutations,
            });
            console.log(
              `${browserName} ${locale} ${width} ${existing ? "existing" : "empty"}: PASS`,
            );
            await context.close();
          }
      const soldOutContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const soldOutProduct = {
        ...product,
        variants: product.variants.map((v) => ({
          ...v,
          inventory: { stockOnHand: 0, availableQuantity: 0 },
        })),
      };
      await soldOutContext.route("http://localhost:4000/**", (route) =>
        fulfill(route, {
          json: {
            success: true,
            data: route.request().url().includes("/storefront/")
              ? {
                  ...fixture,
                  products: [soldOutProduct],
                  product: soldOutProduct,
                }
              : { id: "empty", items: [] },
          },
        }),
      );
      const soldOutPage = await soldOutContext.newPage();
      await soldOutPage.goto(
        `${base}/store/${fixture.store.slug}/product/${product.id}`,
        { waitUntil: "networkidle" },
      );
      assert.equal(
        await soldOutPage
          .locator('[data-testid="buy-now-button"]:visible')
          .first()
          .isDisabled(),
        true,
      );
      await soldOutContext.close();
      console.log(`${browserName} out-of-stock Buy Now blocked: PASS`);
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(
    `${out}/buy-now-browser-results.json`,
    JSON.stringify(
      {
        results,
        realCategoryCounts: "2 / 2 in all four engines",
        physicalSafariVerified: false,
      },
      null,
      2,
    ),
  );
  console.log(
    `Buy Now/browser matrix: ${results.length} passed; actual category counts verified in all four engines.`,
  );
}
