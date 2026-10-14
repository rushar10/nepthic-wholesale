"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, db, eq, isNull, orderItems, orders, products, variants } from "@/db";
import { paymentSplit } from "@/core/pricing";
import { effectivePaymentMode, getSettings } from "@/core/settings";
import { startCheckout } from "@/core/payments";
import { audit } from "@/core/audit";
import { env } from "@/core/env";
import { int, str, type FormState } from "@/core/forms";
import { orderNo } from "@/ui/format";
import { priceCart, readCart, writeCart } from "@/lib/cart";
import { requireApprovedBusiness } from "@/lib/session";

/** Sets the size breakdown for one style in the bulk order. */
export async function setLine(_: FormState, fd: FormData): Promise<FormState> {
  await requireApprovedBusiness();
  const productId = str(fd, "productId");
  const product = await db.query.products.findFirst({ where: and(eq(products.id, productId), eq(products.wholesaleEnabled, true), isNull(products.archivedAt)), with: { variants: true } });
  if (!product) return { error: "That style isn't available for wholesale." };
  const settings = await getSettings();

  const qty = product.variants.map((v) => ({ v, q: Math.max(0, int(fd, `qty_${v.id}`)) }));
  const units = qty.reduce((a, x) => a + x.q, 0);
  if (units > 0 && units < settings.moqPerStyle) return { error: `Add at least ${settings.moqPerStyle} units of ${product.name}. You have ${units}.` };
  const over = qty.find((x) => x.q > x.v.stock);
  if (over) return { error: `Only ${over.v.stock} in size ${over.v.size}. For more, request a quote.` };

  const cart = await readCart();
  for (const { v, q } of qty) {
    if (q > 0) cart[v.id] = q;
    else delete cart[v.id];
  }
  await writeCart(cart);
  revalidatePath("/", "layout");
  return { ok: units > 0 ? `${units} × ${product.name} in your order` : `${product.name} removed from your order` };
}

export async function removeProduct(fd: FormData) {
  await requireApprovedBusiness();
  const productId = str(fd, "productId");
  const vs = await db.select({ id: variants.id }).from(variants).where(eq(variants.productId, productId));
  const cart = await readCart();
  for (const v of vs) delete cart[v.id];
  await writeCart(cart);
  revalidatePath("/", "layout");
}

export async function placeOrder(_: FormState): Promise<FormState> {
  const user = await requireApprovedBusiness();
  const priced = await priceCart();
  if (priced.units === 0) return { error: "Your bulk order is empty." };
  if (priced.errors.length) return { error: priced.errors[0] };

  const mode = await effectivePaymentMode(user.businessId);
  const { dueNowCents, balanceCents } = paymentSplit(priced.totalCents, mode, priced.settings.depositPct);

  const order = await db.transaction(async (tx) => {
    const [o] = await tx.insert(orders).values({
      businessId: user.businessId, userId: user.id, paymentMode: mode,
      depositPct: mode === "DEPOSIT" ? priced.settings.depositPct : 0,
      tierDiscountPct: priced.discountPct, subtotalCents: priced.subtotalCents, gstCents: priced.gstCents, totalCents: priced.totalCents,
    }).returning();
    await tx.insert(orderItems).values(priced.lines.flatMap((l) => l.sizes.filter((s) => s.quantity > 0).map((s) => ({
      orderId: o.id, variantId: s.variantId, description: `${l.productName} · ${s.size}`, quantity: s.quantity, unitPriceCents: l.unitPriceCents,
    }))));
    return o;
  });
  await audit(user.id, "order.placed", "Order", order.id, { totalCents: order.totalCents, mode, balanceCents });

  const url = await startCheckout({
    kind: mode === "DEPOSIT" ? "DEPOSIT" : "FULL",
    amountCents: dueNowCents,
    description: `${orderNo(order.number)} · ${mode === "DEPOSIT" ? `${priced.settings.depositPct}% deposit` : "full payment"}`,
    email: user.email,
    orderId: order.id,
    successUrl: `${env.siteUrl}/account/orders/${order.id}?paid=1`,
    cancelUrl: `${env.siteUrl}/account/orders/${order.id}`,
  });
  await writeCart({});
  redirect(url);
}

/** Pays the outstanding balance (or retries a failed first payment). */
export async function payOutstanding(fd: FormData) {
  const user = await requireApprovedBusiness();
  const order = await db.query.orders.findFirst({ where: and(eq(orders.id, str(fd, "orderId")), eq(orders.businessId, user.businessId!)) });
  if (!order || order.status === "CANCELLED") redirect("/account");
  const due = order.totalCents - order.paidCents;
  if (due <= 0) redirect(`/account/orders/${order.id}`);
  const settings = await getSettings();
  // First payment still owed: charge the deposit (if on deposit terms), otherwise the remainder.
  const first = order.paidCents === 0 && order.paymentMode === "DEPOSIT";
  const amount = first ? paymentSplit(order.totalCents, "DEPOSIT", order.depositPct || settings.depositPct).dueNowCents : due;
  const url = await startCheckout({
    kind: first ? "DEPOSIT" : order.paidCents > 0 ? "BALANCE" : "FULL",
    amountCents: amount,
    description: `${orderNo(order.number)} · ${first ? "deposit" : order.paidCents > 0 ? "balance" : "full payment"}`,
    email: user.email,
    orderId: order.id,
    successUrl: `${env.siteUrl}/account/orders/${order.id}?paid=1`,
    cancelUrl: `${env.siteUrl}/account/orders/${order.id}`,
  });
  redirect(url);
}
