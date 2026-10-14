import { and, db, eq, orders, payments, sql, variants } from "@/db";
import { emails } from "./email";

/* Runs once per successful payment (Stripe webhook or mock). Idempotent: a payment that
   is no longer PENDING is skipped, so Stripe retries are harmless. */
export async function fulfilPayment(sessionId: string, paymentIntentId?: string) {
  const payment = await db.query.payments.findFirst({ where: eq(payments.stripeSessionId, sessionId) });
  if (!payment || payment.status !== "PENDING") return;

  const after = await db.transaction(async (tx) => {
    const flipped = await tx.update(payments)
      .set({ status: "SUCCEEDED", stripePaymentIntentId: paymentIntentId, paidAt: new Date() })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "PENDING")))
      .returning({ id: payments.id });
    if (flipped.length !== 1) return null;

    if (payment.orderId) {
      const order = await tx.query.orders.findFirst({ where: eq(orders.id, payment.orderId), with: { items: true, user: true } });
      if (!order) return null;
      const paidCents = order.paidCents + payment.amountCents;
      const full = paidCents >= order.totalCents;
      if (!order.stockDeducted) {
        for (const it of order.items) {
          if (it.variantId) await tx.update(variants).set({ stock: sql`${variants.stock} - ${it.quantity}` }).where(eq(variants.id, it.variantId));
        }
      }
      await tx.update(orders).set({
        paidCents,
        stockDeducted: true,
        status: full ? "PAID" : "DEPOSIT_PAID",
        fulfilment: order.fulfilment === "UNFULFILLED" ? "IN_PRODUCTION" : order.fulfilment,
      }).where(eq(orders.id, order.id));
      return { to: order.user.email, number: order.number, paidCents, totalCents: order.totalCents, orderId: order.id };
    }

    return null;
  });

  if (!after) return;
  await emails.orderPayment(after.to, after.number, after.paidCents, after.totalCents, after.orderId);
}

/** Abandoned or failed checkout: mark it failed (the order stays, awaiting payment). */
export async function expirePayment(sessionId: string) {
  const payment = await db.query.payments.findFirst({ where: eq(payments.stripeSessionId, sessionId) });
  if (!payment || payment.status !== "PENDING") return;
  await db.transaction(async (tx) => {
    await tx.update(payments).set({ status: "FAILED" }).where(eq(payments.id, payment.id));
  });
}
