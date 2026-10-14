/* Pure pricing rules for wholesale. No database access, so it runs in tests,
   in server actions and in the browser (live totals in the bulk builder). */

export type Tier = { minUnits: number; maxUnits: number | null; discountPct: number };
export type Mode = "FULL" | "DEPOSIT";

export type CartLineInput = {
  productId: string;
  productName: string;
  slug?: string;
  rrpCents: number;
  sizes: { variantId: string; size: string; quantity: number; stock: number }[];
};

export type PricedLine = CartLineInput & { units: number; unitPriceCents: number; lineCents: number; belowMoq: boolean; overStock: boolean };

export const GST_RATE = 0.1;

export function tierFor(units: number, tiers: Tier[]): Tier | null {
  const sorted = [...tiers].sort((a, b) => a.minUnits - b.minUnits);
  let hit: Tier | null = null;
  for (const t of sorted) if (units >= t.minUnits && (t.maxUnits == null || units <= t.maxUnits)) hit = t;
  return hit;
}

export function nextTier(units: number, tiers: Tier[]): Tier | null {
  return [...tiers].sort((a, b) => a.minUnits - b.minUnits).find((t) => t.minUnits > units) ?? null;
}

/** Trade unit price ex GST: RRP less the tier discount, rounded to the cent. */
export function tradeUnitCents(rrpCents: number, discountPct: number) {
  return Math.round((rrpCents * (100 - discountPct)) / 100);
}

export function priceBulkOrder(lines: CartLineInput[], tiers: Tier[], moqPerStyle: number) {
  const units = lines.reduce((a, l) => a + l.sizes.reduce((x, s) => x + s.quantity, 0), 0);
  const tier = tierFor(units, tiers);
  const discountPct = tier?.discountPct ?? 0;
  const priced: PricedLine[] = lines.map((l) => {
    const u = l.sizes.reduce((x, s) => x + s.quantity, 0);
    const unitPriceCents = tradeUnitCents(l.rrpCents, discountPct);
    return {
      ...l,
      units: u,
      unitPriceCents,
      lineCents: unitPriceCents * u,
      belowMoq: u < moqPerStyle,
      overStock: l.sizes.some((s) => s.quantity > s.stock),
    };
  });
  const subtotalCents = priced.reduce((a, l) => a + l.lineCents, 0);
  const gstCents = Math.round(subtotalCents * GST_RATE);
  const errors: string[] = [];
  for (const l of priced) {
    if (l.belowMoq) errors.push(`${l.productName} needs at least ${moqPerStyle} units (has ${l.units}).`);
    if (l.overStock) errors.push(`${l.productName}: a size is above available stock. Request a quote instead.`);
  }
  if (units > 0 && !tier) errors.push("Order is below the lowest volume tier.");
  return { lines: priced, units, tier, discountPct, subtotalCents, gstCents, totalCents: subtotalCents + gstCents, errors };
}

/** What is charged now and what is left for later. */
export function paymentSplit(totalCents: number, mode: Mode, depositPct: number) {
  if (mode === "FULL") return { dueNowCents: totalCents, balanceCents: 0 };
  const dueNowCents = Math.round((totalCents * depositPct) / 100);
  return { dueNowCents, balanceCents: totalCents - dueNowCents };
}

/** Splits a GST-inclusive total into ex-GST and GST parts. */
export function splitGst(totalIncCents: number) {
  const subtotalCents = Math.round(totalIncCents / (1 + GST_RATE));
  return { subtotalCents, gstCents: totalIncCents - subtotalCents };
}
