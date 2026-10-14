import { revalidatePath } from "next/cache";
import {
  and, asc, businesses, catalogueImports, db, desc, eq, ilike, inArray, isNotNull, isNull, or, orders, payments,
  priceTiers, products, quotes, returnRequests, settings, sql, users, variants, type PaymentKind,
} from "@/db";
import { getSettings, getTiers } from "@/core/settings";
import { refundPayment } from "@/core/payments";
import { importCatalogue } from "@/core/catalogue-import";
import { emails } from "@/core/email";
import { audit } from "@/core/audit";
import { env } from "@/core/env";
import { orderNo, quoteNo, returnNo } from "@/ui/format";
import { pendingCounts } from "./counts";
import { balancesDue, monthlyRevenue, recentActivity, revenueByStockist, salesToday, week } from "./dashboard";
import { OpsError, actorId, actorNote, b, money, n, ok, s, type Op } from "./kit";

/* ---------------------------------------------------------------------------
   Every admin screen and action for Nepthic Wholesale, as named operations the portal calls
   (POST /api/ops/v1/<name>). Reads return plain JSON; actions return { ok } or fail with a
   readable message. Each one writes to this site's audit log with the portal user's email.
--------------------------------------------------------------------------- */

const terms = (mode: "FULL" | "DEPOSIT", pct: number) => (mode === "DEPOSIT" ? `${pct}% deposit, balance before dispatch` : "Full payment on acceptance");
const fresh = () => revalidatePath("/", "layout");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const ops: Record<string, Op> = {
  /* ------------------------------ reads ------------------------------ */

  /** Small summary for the portal's all-sites overview. */
  "summary": { level: "view", run: async () => {
    const [months, wk, bal, today, pending, [last30]] = await Promise.all([
      monthlyRevenue(), week(), balancesDue(), salesToday(), pendingCounts(),
      db.select({ cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` }).from(payments)
        .where(sql`${payments.status} = 'SUCCEEDED' and ${payments.paidAt} >= now() - interval '30 days'`),
    ]);
    return {
      site: "wholesale", generatedAt: new Date().toISOString(),
      revenue: { monthly: months.map((m) => ({ month: m.key, cents: m.value })), last30Cents: last30.cents },
      orders: wk.orders, units: wk.units,
      balances: { totalCents: bal.total, count: bal.count, overdue: bal.overdue },
      pending, today: { totalCents: today.total },
    };
  } },

  "counts": { level: "view", run: () => pendingCounts() },

  "dashboard": { level: "view", run: async () => {
    const [months, byStockist, wk, bal, activity, today, appr] = await Promise.all([
      monthlyRevenue(), revenueByStockist(30), week(), balancesDue(), recentActivity(), salesToday(), pendingCounts(),
    ]);
    return { months, byStockist, week: wk, balances: bal, activity, today, approvals: appr };
  } },

  "approvals.list": { level: "view", run: async () => {
    const [p, q, ret, biz] = await Promise.all([
      pendingCounts(),
      db.query.quotes.findMany({ where: eq(quotes.status, "REQUESTED"), with: { business: { columns: { tradingName: true } } }, orderBy: asc(quotes.createdAt), limit: 20 }),
      db.query.returnRequests.findMany({ where: eq(returnRequests.status, "PENDING"), with: { order: { columns: { number: true }, with: { business: { columns: { tradingName: true } } } } }, orderBy: asc(returnRequests.createdAt), limit: 20 }),
      db.query.businesses.findMany({ where: eq(businesses.status, "PENDING"), orderBy: desc(businesses.createdAt), limit: 20 }),
    ]);
    return {
      counts: p,
      quotes: q.map((x) => ({ id: x.id, number: x.number, business: x.business.tradingName, itemsText: x.itemsText, createdAt: x.createdAt })),
      returns: ret.map((x) => ({ id: x.id, number: x.number, business: x.order.business?.tradingName ?? null, reason: x.reason, units: x.units, createdAt: x.createdAt })),
      businesses: biz.map((x) => ({ id: x.id, tradingName: x.tradingName, abn: x.abn, city: x.city, state: x.state, createdAt: x.createdAt })),
    };
  } },

  "quotes.list": { level: "view", run: async (i) => {
    const st = await getSettings();
    const all = await db.query.quotes.findMany({
      orderBy: desc(quotes.createdAt), limit: 200,
      with: { business: { columns: { tradingName: true } }, user: { columns: { name: true, email: true } }, order: { columns: { id: true, number: true } } },
    });
    const open = all.filter((q) => q.status === "REQUESTED");
    return {
      settings: { paymentMode: st.paymentMode, depositPct: st.depositPct, quoteValidDays: st.quoteValidDays },
      openCount: open.length,
      quotes: s(i, "show") === "all" ? all : open,
    };
  } },

  "orders.list": { level: "view", run: async (i) => {
    const all = await db.query.orders.findMany({ orderBy: desc(orders.createdAt), limit: 300, with: { business: { columns: { tradingName: true } }, items: true } });
    return { orders: s(i, "show") === "all" ? all : all.filter((o) => o.status !== "CANCELLED" && o.fulfilment !== "DELIVERED") };
  } },

  "products.list": { level: "view", run: async () => {
    const [live, archived, runs] = await Promise.all([
      db.query.products.findMany({ where: isNull(products.archivedAt), orderBy: asc(products.sortOrder), with: { variants: { orderBy: asc(variants.sortOrder) } } }),
      db.query.products.findMany({ where: isNotNull(products.archivedAt), orderBy: desc(products.archivedAt), limit: 20, columns: { id: true, name: true, archivedAt: true } }),
      db.query.catalogueImports.findMany({ orderBy: desc(catalogueImports.startedAt), limit: 5 }),
    ]);
    const source = env.catalogueUrl.startsWith("file:") ? "sample file (local development)" : new URL(env.catalogueUrl).host;
    return { live, archived, runs, source };
  } },

  "businesses.list": { level: "view", run: async () => {
    const list = await db.query.businesses.findMany({
      orderBy: desc(businesses.createdAt),
      with: { users: { columns: { name: true, email: true } }, orders: { columns: { id: true } } },
    });
    return { businesses: list.map(({ orders: o, ...x }) => ({ ...x, orderCount: o.length })) };
  } },

  "customers.list": { level: "view", run: async (i) => {
    const term = s(i, "q");
    const list = await db.query.users.findMany({
      where: term ? or(ilike(users.name, `%${term}%`), ilike(users.email, `%${term}%`)) : undefined,
      orderBy: desc(users.createdAt), limit: 200,
      with: { business: { columns: { tradingName: true, status: true } } },
      columns: { id: true, name: true, email: true, createdAt: true },
    });
    const spend = list.length
      ? await db.select({
          userId: orders.userId, n: sql<number>`count(*)::int`,
          cents: sql<number>`coalesce(sum(${orders.paidCents} - ${orders.refundedCents}),0)::int`,
        }).from(orders).where(and(inArray(orders.userId, list.map((u) => u.id)), sql`${orders.status} <> 'CANCELLED'`)).groupBy(orders.userId)
      : [];
    const by = new Map(spend.map((x) => [x.userId, x]));
    return { customers: list.map((u) => ({ ...u, orderCount: by.get(u.id)?.n ?? 0, paidCents: by.get(u.id)?.cents ?? 0 })) };
  } },

  "returns.list": { level: "view", run: async (i) => {
    const all = await db.query.returnRequests.findMany({
      orderBy: desc(returnRequests.createdAt), limit: 200,
      with: { user: { columns: { name: true, email: true } }, order: { columns: { number: true, paidCents: true, refundedCents: true }, with: { business: { columns: { tradingName: true } } } } },
    });
    return { returns: s(i, "show") === "all" ? all : all.filter((r) => r.status === "PENDING" || r.status === "APPROVED") };
  } },

  "pricing.get": { level: "view", run: async () => {
    const [tiers, st] = await Promise.all([getTiers(), getSettings()]);
    return { tiers, moq: st.moqPerStyle };
  } },

  /** Product page link for the admin preview bar's "Edit this product" shortcut. */
  "product.bySlug": { level: "view", run: async (i) => {
    const p = await db.query.products.findFirst({ where: eq(products.slug, s(i, "slug")), columns: { id: true, name: true, slug: true } });
    if (!p) throw new OpsError("Product not found.", 404);
    return p;
  } },

  "payments.list": { level: "manage", run: async (i) => {
    const KINDS: PaymentKind[] = ["FULL", "DEPOSIT", "BALANCE", "REFUND"];
    const k = KINDS.find((x) => x === s(i, "kind"));
    const list = await db.query.payments.findMany({
      where: and(eq(payments.status, "SUCCEEDED"), isNotNull(payments.paidAt), k ? eq(payments.kind, k) : undefined),
      orderBy: desc(payments.paidAt), limit: 300,
      with: { order: { columns: { number: true }, with: { business: { columns: { tradingName: true } } } } },
    });
    return { payments: list, mode: env.paymentsMode };
  } },

  "settings.get": { level: "manage", run: async () => {
    const st = await getSettings();
    return {
      settings: st,
      connections: {
        payments: env.paymentsMode === "stripe" ? "Stripe (live keys from env)" : "Mock mode — nothing is charged",
        email: env.resendApiKey ? `Resend · from ${env.emailFrom}` : "Logged only (no RESEND_API_KEY)",
        alerts: env.adminNotifyEmail || "Not set (ADMIN_NOTIFY_EMAIL)",
      },
    };
  } },

  /* ---------------------------- day-to-day ---------------------------- */

  "quote.respond": { level: "operate", run: async (i, a) => {
    const q = await db.query.quotes.findFirst({ where: eq(quotes.id, s(i, "quoteId")), with: { user: true } });
    if (!q || q.status !== "REQUESTED") throw new OpsError("This request has already been answered.", 409);
    const decision = s(i, "decision"), reply = s(i, "reply");
    const st = await getSettings();
    if (decision === "decline") {
      const text = reply || "We can't take this one on right now.";
      await db.update(quotes).set({ status: "DECLINED", reply: text, respondedAt: new Date() }).where(eq(quotes.id, q.id));
      await emails.enquiryAnswered(q.user.email, q.number, text);
      await audit(actorId(a), "quote.declined", "Quote", q.id, actorNote(a));
      fresh();
      return ok(`${quoteNo(q.number)} declined. ${q.user.email} has been emailed.`);
    }
    if (q.type === "ENQUIRY") {
      if (!reply) throw new OpsError("Write a reply.");
      await db.update(quotes).set({ status: "ANSWERED", reply, respondedAt: new Date() }).where(eq(quotes.id, q.id));
      await emails.enquiryAnswered(q.user.email, q.number, reply);
      await audit(actorId(a), "enquiry.answered", "Quote", q.id, actorNote(a));
      fresh();
      return ok(`Reply to ${quoteNo(q.number)} sent to ${q.user.email}.`);
    }
    const amountCents = money(i, "amount");
    if (amountCents <= 0) throw new OpsError("Enter the quote total including GST.");
    const m = s(i, "paymentMode");
    const mode = m === "FULL" || m === "DEPOSIT" ? m : null;
    const expiresAt = new Date(Date.now() + st.quoteValidDays * 864e5);
    await db.update(quotes).set({ status: "QUOTED", amountCents, paymentMode: mode, reply, respondedAt: new Date(), expiresAt }).where(eq(quotes.id, q.id));
    await emails.quoteSent(q.user.email, q.number, amountCents, terms(mode ?? st.paymentMode, st.depositPct), reply, q.id);
    await audit(actorId(a), "quote.sent", "Quote", q.id, { ...actorNote(a), amountCents, mode });
    fresh();
    return ok(`${quoteNo(q.number)} sent to ${q.user.email}.`);
  } },

  "order.requestBalance": { level: "operate", run: async (i, a) => {
    const o = await db.query.orders.findFirst({ where: eq(orders.id, s(i, "orderId")), with: { user: true } });
    if (!o || o.paidCents === 0 || o.paidCents >= o.totalCents) throw new OpsError("There's no balance to request on this order.", 409);
    const st = await getSettings();
    const due = new Date(Date.now() + st.balanceDueDays * 864e5);
    await db.update(orders).set({ status: "BALANCE_REQUESTED", balanceDueAt: due }).where(eq(orders.id, o.id));
    await emails.balanceRequested(o.user.email, o.number, o.totalCents - o.paidCents, due, o.id);
    await audit(actorId(a), "order.balance_requested", "Order", o.id, actorNote(a));
    return ok(`Balance requested for ${orderNo(o.number)}.`);
  } },

  "order.fulfilment": { level: "operate", run: async (i, a) => {
    const o = await db.query.orders.findFirst({ where: eq(orders.id, s(i, "orderId")), with: { user: true } });
    if (!o) throw new OpsError("Order not found.", 404);
    const to = s(i, "to");
    if (to === "SHIPPED") {
      if (o.status !== "PAID") throw new OpsError("Orders ship only once they're paid in full.", 409);
      await db.update(orders).set({ fulfilment: "SHIPPED" }).where(eq(orders.id, o.id));
      await emails.orderShipped(o.user.email, o.number, o.id);
    } else if (to === "DELIVERED" && o.fulfilment === "SHIPPED") {
      await db.update(orders).set({ fulfilment: "DELIVERED" }).where(eq(orders.id, o.id));
    } else throw new OpsError("That change isn't possible for this order.", 409);
    await audit(actorId(a), `order.${to.toLowerCase()}`, "Order", o.id, actorNote(a));
    fresh();
    return ok(`${orderNo(o.number)} marked ${to.toLowerCase()}.`);
  } },

  "product.save": { level: "operate", run: async (i, a) => {
    const id = s(i, "productId");
    const p = await db.query.products.findFirst({ where: eq(products.id, id), with: { variants: true } });
    if (!p) throw new OpsError("Product not found.", 404);
    // Imported products keep the Clothing catalogue's RRP, name, image and sizes.
    const imported = !!p.sourceId;
    const priceCents = imported ? p.priceCents : money(i, "price");
    if (priceCents <= 0) throw new OpsError("Enter the RRP.");
    const stock = (i.stock ?? {}) as Record<string, unknown>;
    await db.transaction(async (tx) => {
      await tx.update(products).set(imported
        ? { wholesaleEnabled: b(i, "wholesaleEnabled") }
        : { priceCents, wholesaleEnabled: b(i, "wholesaleEnabled"), imageUrl: s(i, "imageUrl") || null },
      ).where(eq(products.id, id));
      for (const v of p.variants) {
        if (v.id in stock) await tx.update(variants).set({ stock: Math.max(0, parseInt(String(stock[v.id]), 10) || 0) }).where(eq(variants.id, v.id));
      }
      const newSize = s(i, "newSize");
      if (!imported && newSize && !p.variants.some((v) => v.size.toLowerCase() === newSize.toLowerCase())) {
        await tx.insert(variants).values({ productId: id, size: newSize, sku: `${p.slug.toUpperCase()}-${newSize.toUpperCase()}`, stock: Math.max(0, n(i, "newStock")), sortOrder: p.variants.length });
      }
    });
    await audit(actorId(a), "product.updated", "Product", id, actorNote(a));
    fresh();
    return ok(`${p.name} saved.`);
  } },

  "product.create": { level: "operate", run: async (i, a) => {
    const name = s(i, "name");
    const slug = (s(i, "slug") || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const sizes = s(i, "sizes").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
    const priceCents = money(i, "price");
    if (!name || !sizes.length || priceCents <= 0) throw new OpsError("Name, RRP and at least one size are required.");
    if (await db.query.products.findFirst({ where: eq(products.slug, slug) })) throw new OpsError(`A product already uses /${slug}.`, 409);
    const stock = Math.max(0, n(i, "stock"));
    const [p] = await db.insert(products).values({
      name, slug, category: s(i, "category") || "Tees", priceCents, description: s(i, "description"),
      hue: Math.floor(Math.random() * 360), wholesaleEnabled: b(i, "wholesaleEnabled"),
    }).returning();
    await db.insert(variants).values(sizes.map((size, k) => ({ productId: p.id, size, sku: `${slug.toUpperCase()}-${size.toUpperCase()}`, stock, sortOrder: k })));
    await audit(actorId(a), "product.created", "Product", p.id, actorNote(a));
    fresh();
    return ok(`${name} added.`, { slug });
  } },

  "catalogue.import": { level: "operate", run: async (_, a) => {
    const r = await importCatalogue("admin");
    await audit(actorId(a), "catalogue.import", "Catalogue", "clothing", { ...actorNote(a), ...r });
    fresh();
    if (!r.ok) throw new OpsError(`Import failed, so nothing changed and Wholesale keeps its last good copy. ${r.error}`, 502);
    return ok(`Imported: ${r.created} new, ${r.updated} updated, ${r.archived} archived.`);
  } },

  /* ------------------- approvals, money, pricing, settings ------------------- */

  "order.terms": { level: "manage", run: async (i, a) => {
    const o = await db.query.orders.findFirst({ where: eq(orders.id, s(i, "orderId")) });
    if (!o) throw new OpsError("Order not found.", 404);
    if (o.paidCents > 0) throw new OpsError("Payment terms lock once money has been paid.", 409);
    const mode = s(i, "paymentMode") === "FULL" ? "FULL" : "DEPOSIT";
    const st = await getSettings();
    await db.update(orders).set({ paymentMode: mode, depositPct: mode === "DEPOSIT" ? st.depositPct : 0 }).where(eq(orders.id, o.id));
    await audit(actorId(a), "order.terms_changed", "Order", o.id, { ...actorNote(a), mode });
    fresh();
    return ok(`${orderNo(o.number)} now ${mode === "FULL" ? "full payment" : `${st.depositPct}% deposit`}.`);
  } },

  "order.cancel": { level: "manage", run: async (i, a) => {
    const id = s(i, "orderId");
    const [o] = await db.update(orders).set({ status: "CANCELLED" }).where(and(eq(orders.id, id), eq(orders.paidCents, 0))).returning();
    if (!o) throw new OpsError("Only unpaid orders can be cancelled.", 409);
    await audit(actorId(a), "order.cancelled", "Order", id, actorNote(a));
    fresh();
    return ok(`${orderNo(o.number)} cancelled.`);
  } },

  "business.status": { level: "manage", run: async (i, a) => {
    const id = s(i, "businessId");
    const status = s(i, "status") === "APPROVED" ? "APPROVED" : "REJECTED";
    const [bz] = await db.update(businesses).set({ status }).where(eq(businesses.id, id)).returning();
    if (!bz) throw new OpsError("Business not found.", 404);
    if (status === "APPROVED") {
      const owner = await db.query.users.findFirst({ where: eq(users.businessId, bz.id) });
      if (owner) await emails.businessApproved(owner.email, bz.tradingName);
    }
    await audit(actorId(a), `business.${status.toLowerCase()}`, "Business", id, actorNote(a));
    fresh();
    return ok(status === "APPROVED" ? `${bz.tradingName} approved` : "Application declined");
  } },

  "business.terms": { level: "manage", run: async (i, a) => {
    const v = s(i, "paymentMode");
    const mode = v === "FULL" || v === "DEPOSIT" ? v : null;
    const [bz] = await db.update(businesses).set({ paymentModeOverride: mode }).where(eq(businesses.id, s(i, "businessId"))).returning();
    if (!bz) throw new OpsError("Business not found.", 404);
    await audit(actorId(a), "business.terms", "Business", bz.id, { ...actorNote(a), mode });
    fresh();
    return ok(`${bz.tradingName}: ${mode === "FULL" ? "always full payment" : mode === "DEPOSIT" ? "always deposit" : "default terms"}.`);
  } },

  "pricing.save": { level: "manage", run: async (i, a) => {
    const raw = Array.isArray(i.rows) ? (i.rows as Record<string, unknown>[]) : [];
    const rows = raw
      .map((r) => ({ minUnits: n(r, "min"), maxUnits: s(r, "max") ? parseInt(s(r, "max"), 10) : null, discountPct: n(r, "off") }))
      .filter((r) => r.minUnits || r.discountPct)
      .sort((x, y) => x.minUnits - y.minUnits);
    if (!rows.length) throw new OpsError("Keep at least one tier.");
    for (const [k, r] of rows.entries()) {
      if (r.minUnits < 1 || r.discountPct < 0 || r.discountPct > 90) throw new OpsError("Tiers need a minimum of 1+ units and a discount between 0 and 90%.");
      if (r.maxUnits != null && r.maxUnits < r.minUnits) throw new OpsError(`Tier ${k + 1}: "to" is below "from".`);
      const next = rows[k + 1];
      if (next && (r.maxUnits == null || r.maxUnits >= next.minUnits)) throw new OpsError(`Tier ${k + 1} overlaps tier ${k + 2}. End it below ${next.minUnits}.`);
    }
    const moq = n(i, "moq");
    if (moq < 1) throw new OpsError("Minimum per style must be at least 1.");
    await db.transaction(async (tx) => {
      await tx.delete(priceTiers);
      await tx.insert(priceTiers).values(rows);
      await tx.update(settings).set({ moqPerStyle: moq, updatedAt: new Date() }).where(eq(settings.id, 1));
    });
    await audit(actorId(a), "pricing.saved", "PriceTier", "all", { ...actorNote(a), rows, moq });
    fresh();
    return ok("Pricing saved. New orders use it straight away.");
  } },

  "return.decide": { level: "manage", run: async (i, a) => {
    const r = await db.query.returnRequests.findFirst({ where: eq(returnRequests.id, s(i, "returnId")), with: { user: true } });
    if (!r || r.status !== "PENDING") throw new OpsError("This return has already been decided.", 409);
    const approve = s(i, "decision") === "APPROVED";
    const note = s(i, "note") || (approve
      ? "Approved. We'll email a prepaid return label and next steps."
      : "Not approved after review. Reply to this email if you'd like to discuss it.");
    await db.update(returnRequests).set({ status: approve ? "APPROVED" : "REJECTED", decisionNote: note, reviewedById: actorId(a), reviewedAt: new Date() }).where(eq(returnRequests.id, r.id));
    await emails.returnDecision(r.user.email, r.number, approve, note);
    await audit(actorId(a), approve ? "return.approved" : "return.rejected", "ReturnRequest", r.id, actorNote(a));
    fresh();
    return ok(`${returnNo(r.number)} ${approve ? "approved" : "rejected"}. The buyer has been emailed.`);
  } },

  /** After an approved return arrives back: refund money (optional) and close it. */
  "return.complete": { level: "manage", run: async (i, a) => {
    const r = await db.query.returnRequests.findFirst({ where: eq(returnRequests.id, s(i, "returnId")), with: { order: true } });
    if (!r || r.status !== "APPROVED") throw new OpsError("Only approved returns can be completed.", 409);
    const asked = money(i, "refund");
    let amount = asked;
    const refundable = r.order.paidCents - r.order.refundedCents;
    if (amount < 0 || amount > refundable) throw new OpsError(`At most ${(refundable / 100).toFixed(2)} can be refunded on ${orderNo(r.order.number)}.`);
    if (amount > 0) {
      const paid = await db.query.payments.findMany({ where: and(eq(payments.orderId, r.orderId), eq(payments.status, "SUCCEEDED")), orderBy: desc(payments.createdAt) });
      for (const p of paid.filter((x) => x.amountCents > 0)) {
        if (amount <= 0) break;
        const take = Math.min(amount, p.amountCents);
        try { await refundPayment(p.id, take, `${returnNo(r.number)} refund`); amount -= take; } catch { /* already refunded; try the next */ }
      }
      await db.update(orders).set({ refundedCents: r.order.refundedCents + (asked - amount) }).where(eq(orders.id, r.orderId));
    }
    await db.update(returnRequests).set({ status: "COMPLETED" }).where(eq(returnRequests.id, r.id));
    await audit(actorId(a), "return.completed", "ReturnRequest", r.id, { ...actorNote(a), refundCents: asked - amount });
    fresh();
    return ok(`${returnNo(r.number)} closed${asked - amount > 0 ? ` and ${((asked - amount) / 100).toFixed(2)} refunded` : ""}.`);
  } },

  "settings.save": { level: "manage", run: async (i, a) => {
    const values = {
      paymentMode: s(i, "paymentMode") === "FULL" ? ("FULL" as const) : ("DEPOSIT" as const),
      depositPct: clamp(n(i, "depositPct"), 5, 90),
      balanceDueDays: clamp(n(i, "balanceDueDays"), 0, 120),
      quoteValidDays: clamp(n(i, "quoteValidDays"), 1, 90),
      moqPerStyle: clamp(n(i, "moqPerStyle"), 1, 1000),
      proximityRadius: clamp(n(i, "proximityRadius"), 20, 400),
      proximityIntensity: clamp(parseFloat(s(i, "proximityIntensity")) || 0, 0, 1),
      proximityEnabled: b(i, "proximityEnabled"),
      updatedAt: new Date(),
    };
    const before = await getSettings();
    await db.update(settings).set(values).where(eq(settings.id, 1));
    await audit(actorId(a), "settings.saved", "Setting", "1", { ...actorNote(a), values, paymentModeChanged: before.paymentMode !== values.paymentMode });
    fresh();
    return ok("Settings saved. Buyers see them on their next page load.");
  } },
};
