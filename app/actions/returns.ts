"use server";
import { redirect } from "next/navigation";
import { and, db, eq, orders, returnRequests } from "@/db";
import { saveImages } from "@/core/uploads";
import { emails, sendEmail } from "@/core/email";
import { audit } from "@/core/audit";
import { env } from "@/core/env";
import { int, str, type FormState } from "@/core/forms";
import { returnNo } from "@/ui/format";
import { requireApprovedBusiness } from "@/lib/session";
import { RETURN_REASONS } from "@/lib/constants";

export async function submitReturn(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireApprovedBusiness();
  const order = await db.query.orders.findFirst({ where: and(eq(orders.id, str(fd, "orderId")), eq(orders.businessId, user.businessId!)) });
  if (!order) return { error: "Choose one of your orders." };
  if (order.fulfilment !== "SHIPPED" && order.fulfilment !== "DELIVERED") return { error: "Returns open once an order has shipped." };
  const reason = str(fd, "reason");
  if (!RETURN_REASONS.includes(reason)) return { error: "Choose a reason." };
  const details = str(fd, "details");
  if (details.length < 10) return { error: "Describe what happened in a sentence or two." };
  const units = int(fd, "units");
  if (units < 1) return { error: "Enter how many units are affected." };

  let photoIds: string[];
  try {
    photoIds = await saveImages(fd.getAll("photos") as File[], user.id, { max: 6 });
  } catch (e) {
    return { error: (e as Error).message };
  }
  const [r] = await db.insert(returnRequests).values({ orderId: order.id, userId: user.id, reason, details, units, photoIds }).returning();
  await audit(user.id, "return.requested", "ReturnRequest", r.id);
  await emails.returnReceived(user.email, r.number);
  if (env.adminNotifyEmail) {
    await sendEmail(env.adminNotifyEmail, `Return ${returnNo(r.number)} from ${user.business.tradingName}`,
      `<p>${reason}: ${units} units.</p><p><a href="${env.siteUrl}/admin/returns">Review in Wholesale admin</a></p>`);
  }
  redirect("/account?tab=returns&sent=1");
}
