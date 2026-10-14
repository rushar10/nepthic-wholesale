import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidAbn } from "../../core/abn";
import { nextTier, paymentSplit, priceBulkOrder, tierFor, tradeUnitCents } from "../../core/pricing";

const tiers = [
  { minUnits: 24, maxUnits: 99, discountPct: 25 },
  { minUnits: 100, maxUnits: 249, discountPct: 35 },
  { minUnits: 250, maxUnits: null, discountPct: 45 },
];
const line = (name: string, rrp: number, qty: number[], stock = 999) => ({
  productId: name, productName: name, rrpCents: rrp,
  sizes: qty.map((q, i) => ({ variantId: `${name}-${i}`, size: String(i), quantity: q, stock })),
});

test("tiers pick by total units across the order", () => {
  assert.equal(tierFor(23, tiers), null);
  assert.equal(tierFor(24, tiers)?.discountPct, 25);
  assert.equal(tierFor(100, tiers)?.discountPct, 35);
  assert.equal(tierFor(1000, tiers)?.discountPct, 45);
  assert.equal(nextTier(60, tiers)?.minUnits, 100);
  assert.equal(nextTier(300, tiers), null);
});

test("trade price is RRP less the tier discount", () => {
  assert.equal(tradeUnitCents(12900, 25), 9675);
  assert.equal(tradeUnitCents(5900, 45), 3245);
});

test("MOQ applies per style, and the size breakdown adds up", () => {
  const ok = priceBulkOrder([line("A", 10000, [10, 10, 10]), line("B", 5000, [12, 12])], tiers, 24);
  assert.equal(ok.units, 54);
  assert.equal(ok.discountPct, 25);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.subtotalCents, 30 * 7500 + 24 * 3750);
  assert.equal(ok.gstCents, Math.round(ok.subtotalCents * 0.1));

  const below = priceBulkOrder([line("A", 10000, [10, 10, 10]), line("B", 5000, [6, 6])], tiers, 24);
  assert.ok(below.errors.some((e) => e.startsWith("B needs at least 24")));
});

test("over-stock sizes are flagged so the buyer requests a quote", () => {
  const r = priceBulkOrder([line("A", 10000, [30], 20)], tiers, 24);
  assert.ok(r.lines[0].overStock);
  assert.ok(r.errors.some((e) => e.includes("above available stock")));
});

test("deposit mode splits the total; full mode charges it all now", () => {
  assert.deepEqual(paymentSplit(10000, "FULL", 30), { dueNowCents: 10000, balanceCents: 0 });
  assert.deepEqual(paymentSplit(10001, "DEPOSIT", 30), { dueNowCents: 3000, balanceCents: 7001 });
});

test("ABN checksum", () => {
  assert.equal(isValidAbn("51 824 753 556"), true);
  assert.equal(isValidAbn("51 824 753 557"), false);
  assert.equal(isValidAbn("123"), false);
});

