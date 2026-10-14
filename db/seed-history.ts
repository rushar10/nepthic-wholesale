/* Twelve months of sample wholesale trading for local development, so the admin dashboard
   has something to show: bulk orders from four stockists (deposit + balance or full
   payment), a few orders still waiting on balances, and open quotes, returns and an
   account application. Runs once (marked in audit_log), never in production, and can be
   skipped with SEED_SAMPLE_HISTORY=0. */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { auditLog, businesses, db, orderItems, orders, payments, quotes, returnRequests, users } from "./index";

const MARK = "seed.sample-history";

// Small deterministic PRNG so every developer sees the same numbers.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20261014);
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const between = (a: number, b: number) => a + R() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));

const DAY = 864e5;
const hourNow = new Date().getHours();
const now = Date.now();
const at = (daysAgo: number, hour: number, minute = int(0, 59)) => {
  const d = new Date(now - daysAgo * DAY);
  d.setHours(hour, minute, int(0, 59), 0);
  return d;
};

const STORE = [["Void Hoodie", 12900], ["Orbit Tee", 5900], ["Static Cargo Pant", 14900], ["Eclipse Crewneck", 10900], ["Drift Track Jacket", 16900], ["Signal Cap", 4500], ["Drop 07 Tee", 7900]] as const;

async function chunks<T>(rows: T[], size: number, fn: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function seedSampleHistory(passwordHash: string) {
  if (process.env.NODE_ENV === "production" || process.env.SEED_SAMPLE_HISTORY === "0") return;
  if (await db.query.auditLog.findFirst({ where: eq(auditLog.action, MARK) })) return;

  // ── stockists ───────────────────────────────────────────────────────
  const stockists = [
    { tradingName: "Kinfolk Supply Co.", abn: "51824753556" },
    { tradingName: "Halftone Store", legalName: "Halftone Retail Pty Ltd", abn: "33102417980", city: "Melbourne", state: "VIC", postcode: "3000", buyer: "Leo Park" },
    { tradingName: "Northbound Skate", legalName: "Northbound Skate Pty Ltd", abn: "86650221114", city: "Gold Coast", state: "QLD", postcode: "4217", buyer: "Ava Reid" },
    { tradingName: "Paper Moon Supply", legalName: "Paper Moon Supply Pty Ltd", abn: "12559008431", city: "Perth", state: "WA", postcode: "6000", buyer: "Noah Fisher" },
  ];
  const bizBuyers: { businessId: string; userId: string }[] = [];
  for (const s of stockists) {
    let b = await db.query.businesses.findFirst({ where: eq(businesses.abn, s.abn) });
    if (!b) {
      [b] = await db.insert(businesses).values({
        legalName: s.legalName!, tradingName: s.tradingName, abn: s.abn, phone: "1300 000 000",
        address: "Sample address", city: s.city!, state: s.state!, postcode: s.postcode!, status: "APPROVED",
      }).returning();
    }
    let u = await db.query.users.findFirst({ where: eq(users.businessId, b.id) });
    if (!u) {
      [u] = await db.insert(users).values({
        email: `buyer@${s.tradingName.toLowerCase().replace(/[^a-z]+/g, "")}.sample.nepthic.dev`,
        name: s.buyer!, passwordHash, role: "BUSINESS", businessId: b.id,
      }).returning();
    }
    bizBuyers.push({ businessId: b.id, userId: u.id });
  }

  const orderRows: (typeof orders.$inferInsert)[] = [];
  const itemRows: (typeof orderItems.$inferInsert)[] = [];
  const payRows: (typeof payments.$inferInsert)[] = [];

  // ── Wholesale: one to three bulk orders a month, deposit then balance ──
  for (let m = 11; m >= 0; m--) {
    const count = int(1, 3);
    for (let i = 0; i < count; i++) {
      const d = Math.max(1, m * 30 + int(0, 28));
      const units = pick([48, 48, 72, 96, 120, 144, 180, 240]);
      const tier = units >= 250 ? 45 : units >= 100 ? 35 : 25;
      const styles = Array.from({ length: int(1, 3) }, () => pick(STORE.slice(0, 6)));
      const per = Math.floor(units / styles.length);
      const sub = styles.reduce((a, s) => a + Math.round((s[1] / 1.1) * (1 - tier / 100)) * per, 0);
      const total = Math.round(sub * 1.1);
      const created = at(d, int(9, 17));
      const balanceAt = new Date(created.getTime() + int(12, 20) * DAY);
      const deposit = balanceAt.getTime() < now - DAY && R() < 0.7;
      const b = pick(bizBuyers);
      const id = randomUUID();
      orderRows.push({ id, businessId: b.businessId, userId: b.userId, status: "PAID", fulfilment: "DELIVERED",
        paymentMode: deposit ? "DEPOSIT" : "FULL", depositPct: deposit ? 30 : 0, tierDiscountPct: tier,
        subtotalCents: sub, gstCents: total - sub, totalCents: total, paidCents: total, stockDeducted: true, createdAt: created });
      for (const s of styles) itemRows.push({ orderId: id, description: `${s[0]} × ${per}`, quantity: per, unitPriceCents: Math.round((s[1] / 1.1) * (1 - tier / 100)) });
      if (deposit) {
        const dep = Math.round(total * 0.3);
        payRows.push({ kind: "DEPOSIT", status: "SUCCEEDED", amountCents: dep, description: `Bulk order deposit 30%`, orderId: id, paidAt: created, createdAt: created });
        payRows.push({ kind: "BALANCE", status: "SUCCEEDED", amountCents: total - dep, description: `Bulk order balance`, orderId: id, paidAt: balanceAt, createdAt: balanceAt });
      } else {
        payRows.push({ kind: "FULL", status: "SUCCEEDED", amountCents: total, description: `Bulk order full payment`, orderId: id, paidAt: created, createdAt: created });
      }
    }
  }

  // ── Open work: orders waiting on a balance, and a few things for the approvals queue ──
  const open = [
    { b: 0, units: 96, style: STORE[0], daysAgo: 9, dueIn: 5, requested: false },
    { b: 1, units: 144, style: STORE[1], daysAgo: 20, dueIn: -2, requested: true },
    { b: 2, units: 72, style: STORE[3], daysAgo: 4, dueIn: 10, requested: false },
  ];
  for (const o of open) {
    const tier = o.units >= 250 ? 45 : o.units >= 100 ? 35 : 25;
    const unit = Math.round((o.style[1] / 1.1) * (1 - tier / 100));
    const sub = unit * o.units, total = Math.round(sub * 1.1), dep = Math.round(total * 0.3);
    const created = at(o.daysAgo, 11);
    const id = randomUUID();
    const b = bizBuyers[o.b];
    orderRows.push({ id, businessId: b.businessId, userId: b.userId, status: o.requested ? "BALANCE_REQUESTED" : "DEPOSIT_PAID",
      fulfilment: "IN_PRODUCTION", paymentMode: "DEPOSIT", depositPct: 30, tierDiscountPct: tier, subtotalCents: sub, gstCents: total - sub,
      totalCents: total, paidCents: dep, balanceDueAt: new Date(now + o.dueIn * DAY), stockDeducted: true, createdAt: created });
    itemRows.push({ orderId: id, description: `${o.style[0]} × ${o.units}`, quantity: o.units, unitPriceCents: unit });
    payRows.push({ kind: "DEPOSIT", status: "SUCCEEDED", amountCents: dep, description: "Bulk order deposit 30%", orderId: id, paidAt: created, createdAt: created });
  }

  // Today: a full-payment order earlier in the day so "Live sales" isn't empty.
  if (hourNow >= 10) {
    const unit = Math.round((STORE[1][1] / 1.1) * 0.75), sub = unit * 48, total = Math.round(sub * 1.1);
    const created = at(0, int(9, hourNow - 1));
    const id = randomUUID();
    const b = bizBuyers[3];
    orderRows.push({ id, businessId: b.businessId, userId: b.userId, status: "PAID", fulfilment: "UNFULFILLED", paymentMode: "FULL",
      tierDiscountPct: 25, subtotalCents: sub, gstCents: total - sub, totalCents: total, paidCents: total, stockDeducted: true, createdAt: created });
    itemRows.push({ orderId: id, description: `${STORE[1][0]} × 48`, quantity: 48, unitPriceCents: unit });
    payRows.push({ kind: "FULL", status: "SUCCEEDED", amountCents: total, description: "Bulk order full payment", orderId: id, paidAt: created, createdAt: created });
  }

  await chunks(orderRows, 400, (p) => db.insert(orders).values(p));
  await chunks(itemRows, 600, (p) => db.insert(orderItems).values(p));
  await chunks(payRows, 500, (p) => db.insert(payments).values(p));

  await db.insert(quotes).values([
    { type: "QUOTE", businessId: bizBuyers[2].businessId, userId: bizBuyers[2].userId, itemsText: "Void Hoodie: S 20, M 40, L 40, XL 20 · custom neck label",
      estimatedUnits: 120, neededBy: new Date(now + 40 * DAY), message: "Can you do a woven neck label with our logo?", createdAt: at(2, 10) },
    { type: "ENQUIRY", businessId: bizBuyers[1].businessId, userId: bizBuyers[1].userId, itemsText: "Summer drop availability",
      estimatedUnits: 0, message: "Will the summer drop be open to stockists before launch?", createdAt: at(1, 15) },
  ]);
  const delivered = orderRows.find((o) => o.status === "PAID" && o.businessId === bizBuyers[0].businessId && o.createdAt! < new Date(now - 30 * DAY));
  if (delivered) {
    await db.insert(returnRequests).values({ orderId: delivered.id!, userId: delivered.userId, reason: "Faulty", details: "Six hoodies arrived with a misprinted chest graphic.", units: 6, createdAt: at(3, 14) });
  }
  const [pendingBiz] = await db.insert(businesses).values({
    legalName: "Coastline Goods Pty Ltd", tradingName: "Coastline Goods", abn: "70123456789", phone: "02 9000 0000",
    address: "4 Sample Street", city: "Newcastle", state: "NSW", postcode: "2300", status: "PENDING", createdAt: at(1, 9),
  }).onConflictDoNothing().returning();
  if (pendingBiz) await db.insert(users).values({ email: "buyer@coastlinegoods.sample.nepthic.dev", name: "Sam Okafor", passwordHash, role: "BUSINESS", businessId: pendingBiz.id }).onConflictDoNothing();

  await db.insert(auditLog).values({ action: MARK, entity: "Seed", entityId: "history", data: { orders: orderRows.length, payments: payRows.length } });
  console.log(`Sample history: ${orderRows.length} bulk orders, ${payRows.length} payments.`);
}
