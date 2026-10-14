"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, db, eq, orderItems, orders, quotes } from "@/db";
import { paymentSplit, splitGst } from "@/core/pricing";
import { effectivePaymentMode, getSettings } from "@/core/settings";
import { startCheckout } from "@/core/payments";
import { emails } from "@/core/email";
import { audit } from "@/core/audit";
import { env } from "@/core/env";
import { int, str, zodMessage, type FormState } from "@/core/forms";
import { orderNo, quoteNo } from "@/ui/format";
import { requireApprovedBusiness, requireBusiness } from "@/lib/session";

const QuoteInput = z.object({
  type: z.enum(["QUOTE", "ENQUIRY"]),
  itemsText: z.string().min(3, "Tell us which styles and quantities you're after."),
  message: z.string().max(4000),
});

export async function submitQuote(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireBusiness();
  const type = str(fd, "type") === "ENQUIRY" ? "ENQUIRY" : "QUOTE";
  const parsed = QuoteInput.safeParse({
    type,
    itemsText: type === "ENQUIRY" ? str(fd, "itemsText") || "General enquiry" : str(fd, "itemsText"),
    message: str(fd, "message"),
  });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  if (type === "ENQUIRY" && !parsed.data.message) return { error: "Write your question in the details box." };
  const neededBy = str(fd, "neededBy");
  const [q] = await db.insert(quotes).values({
    type, businessId: user.businessId!, userId: user.id, itemsText: parsed.data.itemsText,
    estimatedUnits: Math.max(0, int(fd, "estimatedUnits")), neededBy: neededBy ? new Date(neededBy) : null, message: parsed.data.message,
  }).returning();
  await audit(user.id, "quote.requested", "Quote", q.id);
  await emails.quoteReceived(user.email, q.number, type);
  await emails.newQuoteForTeam(q.number, user.business.tradingName);
  redirect(`/account/quotes/${q.id}?sent=1`);
}

export async function acceptQuote(fd: FormData) {
  const user = await requireApprovedBusiness();
  const q = await db.query.quotes.findFirst({ where: and(eq(quotes.id, str(fd, "quoteId")), eq(quotes.businessId, user.businessId!)) });
  if (!q || q.status !== "QUOTED" || !q.amountCents) redirect("/account?tab=quotes");
  if (q.expiresAt && q.expiresAt < new Date()) redirect(`/account/quotes/${q.id}?expired=1`);

  const settings = await getSettings();
  const mode = q.paymentMode ?? (await effectivePaymentMode(user.businessId));
  const { subtotalCents, gstCents } = splitGst(q.amountCents);
  const { dueNowCents } = paymentSplit(q.amountCents, mode, settings.depositPct);

  const order = await db.transaction(async (tx) => {
    const claimed = await tx.update(quotes).set({ status: "CONVERTED" })
      .where(and(eq(quotes.id, q.id), eq(quotes.status, "QUOTED"))).returning({ id: quotes.id });
    if (claimed.length !== 1) return null;
    const [o] = await tx.insert(orders).values({
      businessId: user.businessId, userId: user.id, paymentMode: mode, depositPct: mode === "DEPOSIT" ? settings.depositPct : 0,
      subtotalCents, gstCents, totalCents: q.amountCents!,
    }).returning();
    await tx.insert(orderItems).values({ orderId: o.id, description: `${quoteNo(q.number)}: ${q.itemsText}`, quantity: 1, unitPriceCents: subtotalCents });
    await tx.update(quotes).set({ orderId: o.id }).where(eq(quotes.id, q.id));
    return o;
  });
  if (!order) redirect(`/account/quotes/${q.id}`);
  await audit(user.id, "quote.accepted", "Quote", q.id, { orderId: order.id });

  const url = await startCheckout({
    kind: mode === "DEPOSIT" ? "DEPOSIT" : "FULL",
    amountCents: dueNowCents,
    description: `${orderNo(order.number)} from ${quoteNo(q.number)} · ${mode === "DEPOSIT" ? `${settings.depositPct}% deposit` : "full payment"}`,
    email: user.email,
    orderId: order.id,
    successUrl: `${env.siteUrl}/account/orders/${order.id}?paid=1`,
    cancelUrl: `${env.siteUrl}/account/orders/${order.id}`,
  });
  redirect(url);
}

export async function declineQuote(fd: FormData) {
  const user = await requireBusiness();
  const id = str(fd, "quoteId");
  await db.update(quotes).set({ status: "DECLINED" })
    .where(and(eq(quotes.id, id), eq(quotes.businessId, user.businessId!), eq(quotes.status, "QUOTED")));
  await audit(user.id, "quote.declined_by_buyer", "Quote", id);
  redirect(`/account/quotes/${id}`);
}
