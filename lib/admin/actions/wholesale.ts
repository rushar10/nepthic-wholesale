"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, businesses, db, desc, eq, orders, payments, priceTiers, quotes, returnRequests, settings, users } from "@/db";
import { getSettings } from "@/core/settings";
import { refundPayment } from "@/core/payments";
import { emails } from "@/core/email";
import { audit } from "@/core/audit";
import { cents, int, str, type FormState } from "@/core/forms";
import { orderNo, quoteNo, returnNo } from "@/ui/format";
import { requireAdmin, requireStaff } from "@/lib/admin/guard";
import { run } from "@/lib/admin/run";

const terms = (mode: "FULL" | "DEPOSIT", pct: number) => (mode === "DEPOSIT" ? `${pct}% deposit, balance before dispatch` : "Full payment on acceptance");

/* ---------- quotes ---------- */

export async function respondToQuote(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const staff = await requireStaff();
    const q = await db.query.quotes.findFirst({ where: eq(quotes.id, str(fd, "quoteId")), with: { user: true } });
    if (!q || q.status !== "REQUESTED") return { error: "This request has already been answered." };
    const decision = str(fd, "decision");
    const reply = str(fd, "reply");
    const s = await getSettings();

    if (decision === "decline") {
      await db.update(quotes).set({ status: "DECLINED", reply: reply || "We can't take this one on right now.", respondedAt: new Date() }).where(eq(quotes.id, q.id));
      await emails.enquiryAnswered(q.user.email, q.number, reply || "We can't take this one on right now.");
      await audit(staff.id, "quote.declined", "Quote", q.id);
    } else if (q.type === "ENQUIRY") {
      if (!reply) return { error: "Write a reply." };
      await db.update(quotes).set({ status: "ANSWERED", reply, respondedAt: new Date() }).where(eq(quotes.id, q.id));
      await emails.enquiryAnswered(q.user.email, q.number, reply);
      await audit(staff.id, "enquiry.answered", "Quote", q.id);
    } else {
      const amountCents = cents(fd, "amount");
      if (amountCents <= 0) return { error: "Enter the quote total including GST." };
      const modeIn = str(fd, "paymentMode");
      const mode = modeIn === "FULL" || modeIn === "DEPOSIT" ? modeIn : null;
      const expiresAt = new Date(Date.now() + s.quoteValidDays * 864e5);
      await db.update(quotes).set({ status: "QUOTED", amountCents, paymentMode: mode, reply, respondedAt: new Date(), expiresAt }).where(eq(quotes.id, q.id));
      await emails.quoteSent(q.user.email, q.number, amountCents, terms(mode ?? s.paymentMode, s.depositPct), reply, q.id);
      await audit(staff.id, "quote.sent", "Quote", q.id, { amountCents, mode });
    }
    revalidatePath("/", "layout");
    redirect(`/admin/quotes?done=${encodeURIComponent(`${quoteNo(q.number)} sent to ${q.user.email}.`)}`);
  });
}

/* ---------- orders ---------- */

export async function requestBalance(fd: FormData) {
  const staff = await requireStaff();
  const o = await db.query.orders.findFirst({ where: eq(orders.id, str(fd, "orderId")), with: { user: true } });
  if (!o || o.paidCents === 0 || o.paidCents >= o.totalCents) return;
  const s = await getSettings();
  const due = new Date(Date.now() + s.balanceDueDays * 864e5);
  await db.update(orders).set({ status: "BALANCE_REQUESTED", balanceDueAt: due }).where(eq(orders.id, o.id));
  await emails.balanceRequested(o.user.email, o.number, o.totalCents - o.paidCents, due, o.id);
  await audit(staff.id, "order.balance_requested", "Order", o.id);
  revalidatePath("/admin/orders");
}

export async function setFulfilment(fd: FormData) {
  const staff = await requireStaff();
  const o = await db.query.orders.findFirst({ where: eq(orders.id, str(fd, "orderId")), with: { user: true } });
  if (!o) return;
  const to = str(fd, "to");
  if (to === "SHIPPED") {
    if (o.status !== "PAID") return; // nothing ships until paid in full
    await db.update(orders).set({ fulfilment: "SHIPPED" }).where(eq(orders.id, o.id));
    await emails.orderShipped(o.user.email, o.number, o.id);
  } else if (to === "DELIVERED" && o.fulfilment === "SHIPPED") {
    await db.update(orders).set({ fulfilment: "DELIVERED" }).where(eq(orders.id, o.id));
  } else return;
  await audit(staff.id, `order.${to.toLowerCase()}`, "Order", o.id);
  revalidatePath("/admin/orders");
}

export async function setOrderTerms(fd: FormData) {
  const admin = await requireAdmin();
  const o = await db.query.orders.findFirst({ where: eq(orders.id, str(fd, "orderId")) });
  if (!o || o.paidCents > 0) return; // terms lock once money has moved
  const mode = str(fd, "paymentMode") === "FULL" ? "FULL" : "DEPOSIT";
  const s = await getSettings();
  await db.update(orders).set({ paymentMode: mode, depositPct: mode === "DEPOSIT" ? s.depositPct : 0 }).where(eq(orders.id, o.id));
  await audit(admin.id, "order.terms_changed", "Order", o.id, { mode });
  revalidatePath("/admin/orders");
}

export async function cancelOrder(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "orderId");
  await db.update(orders).set({ status: "CANCELLED" }).where(and(eq(orders.id, id), eq(orders.paidCents, 0)));
  await audit(admin.id, "order.cancelled", "Order", id);
  revalidatePath("/admin/orders");
}

/* ---------- businesses ---------- */

export async function setBusinessStatus(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "businessId");
  const status = str(fd, "status") === "APPROVED" ? "APPROVED" : "REJECTED";
  const [b] = await db.update(businesses).set({ status }).where(eq(businesses.id, id)).returning();
  if (b && status === "APPROVED") {
    const owner = await db.query.users.findFirst({ where: eq(users.businessId, b.id) });
    if (owner) await emails.businessApproved(owner.email, b.tradingName);
  }
  await audit(admin.id, `business.${status.toLowerCase()}`, "Business", id);
  revalidatePath("/", "layout");
}

export async function setBusinessTerms(fd: FormData) {
  const admin = await requireAdmin();
  const v = str(fd, "paymentMode");
  const mode = v === "FULL" || v === "DEPOSIT" ? v : null;
  await db.update(businesses).set({ paymentModeOverride: mode }).where(eq(businesses.id, str(fd, "businessId")));
  await audit(admin.id, "business.terms", "Business", str(fd, "businessId"), { mode });
  revalidatePath("/admin/businesses");
}

/* ---------- pricing ---------- */

export async function saveTiers(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAdmin();
    const rows: { minUnits: number; maxUnits: number | null; discountPct: number }[] = [];
    for (let i = 0; i < 8; i++) {
      if (!fd.has(`min_${i}`)) continue;
      const min = int(fd, `min_${i}`);
      const maxRaw = str(fd, `max_${i}`);
      const off = int(fd, `off_${i}`);
      if (!min && !off) continue; // blank row
      rows.push({ minUnits: min, maxUnits: maxRaw ? parseInt(maxRaw, 10) : null, discountPct: off });
    }
    rows.sort((a, b) => a.minUnits - b.minUnits);
    if (!rows.length) return { error: "Keep at least one tier." };
    for (const [i, r] of rows.entries()) {
      if (r.minUnits < 1 || r.discountPct < 0 || r.discountPct > 90) return { error: "Tiers need a minimum of 1+ units and a discount between 0 and 90%." };
      if (r.maxUnits != null && r.maxUnits < r.minUnits) return { error: `Tier ${i + 1}: "to" is below "from".` };
      const next = rows[i + 1];
      if (next && (r.maxUnits == null || r.maxUnits >= next.minUnits)) return { error: `Tier ${i + 1} overlaps tier ${i + 2}. End it below ${next.minUnits}.` };
    }
    const moq = int(fd, "moq");
    if (moq < 1) return { error: "Minimum per style must be at least 1." };
    await db.transaction(async (tx) => {
      await tx.delete(priceTiers);
      await tx.insert(priceTiers).values(rows);
      await tx.update(settings).set({ moqPerStyle: moq, updatedAt: new Date() }).where(eq(settings.id, 1));
    });
    await audit(admin.id, "pricing.saved", "PriceTier", "all", { rows, moq });
    revalidatePath("/admin/pricing");
    return { ok: "Pricing saved. New orders use it straight away." };
  });
}

/* ---------- returns ---------- */

export async function decideReturn(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAdmin();
    const r = await db.query.returnRequests.findFirst({ where: eq(returnRequests.id, str(fd, "returnId")), with: { user: true } });
    if (!r || r.status !== "PENDING") return { error: "This return has already been decided." };
    const approve = str(fd, "decision") === "APPROVED";
    const note = str(fd, "note") || (approve
      ? "Approved. We'll email a prepaid return label and next steps."
      : "Not approved after review. Reply to this email if you'd like to discuss it.");
    await db.update(returnRequests).set({ status: approve ? "APPROVED" : "REJECTED", decisionNote: note, reviewedById: admin.id, reviewedAt: new Date() }).where(eq(returnRequests.id, r.id));
    await emails.returnDecision(r.user.email, r.number, approve, note);
    await audit(admin.id, approve ? "return.approved" : "return.rejected", "ReturnRequest", r.id);
    revalidatePath("/", "layout");
    redirect(`/admin/returns?done=${encodeURIComponent(`${returnNo(r.number)} ${approve ? "approved" : "rejected"}. The buyer has been emailed.`)}`);
  });
}

/** After an approved return arrives back: refund money (optional) and close it. */
export async function completeReturn(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAdmin();
    const r = await db.query.returnRequests.findFirst({ where: eq(returnRequests.id, str(fd, "returnId")), with: { order: true } });
    if (!r || r.status !== "APPROVED") return { error: "Only approved returns can be completed." };
    let amount = cents(fd, "refund");
    const refundable = r.order.paidCents - r.order.refundedCents;
    if (amount > refundable) return { error: `At most ${(refundable / 100).toFixed(2)} can be refunded on ${orderNo(r.order.number)}.` };
    if (amount > 0) {
      const paid = await db.query.payments.findMany({
        where: and(eq(payments.orderId, r.orderId), eq(payments.status, "SUCCEEDED")),
        orderBy: desc(payments.createdAt),
      });
      for (const p of paid.filter((x) => x.amountCents > 0)) {
        if (amount <= 0) break;
        const take = Math.min(amount, p.amountCents);
        try {
          await refundPayment(p.id, take, `${returnNo(r.number)} refund`);
          amount -= take;
        } catch { /* this payment is fully refunded already; try the next */ }
      }
      const done = cents(fd, "refund") - amount;
      await db.update(orders).set({ refundedCents: r.order.refundedCents + done }).where(eq(orders.id, r.orderId));
    }
    await db.update(returnRequests).set({ status: "COMPLETED" }).where(eq(returnRequests.id, r.id));
    await audit(admin.id, "return.completed", "ReturnRequest", r.id, { refundCents: cents(fd, "refund") - amount });
    revalidatePath("/admin/returns");
    redirect(`/admin/returns?done=${encodeURIComponent(`${returnNo(r.number)} closed.`)}`);
  });
}
