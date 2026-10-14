import { cache } from "react";
import { asc, businesses, db, eq, priceTiers, settings } from "@/db";

export const getSettings = cache(async () => {
  const row = await db.query.settings.findFirst({ where: eq(settings.id, 1) });
  if (row) return row;
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.query.settings.findFirst({ where: eq(settings.id, 1) }))!;
});

export const getTiers = cache(async () => db.select().from(priceTiers).orderBy(asc(priceTiers.minUnits)));

/** The payment mode for a business: its own override, else the global setting. */
export async function effectivePaymentMode(businessId?: string | null) {
  const s = await getSettings();
  if (businessId) {
    const b = await db.query.businesses.findFirst({ where: eq(businesses.id, businessId), columns: { paymentModeOverride: true } });
    if (b?.paymentModeOverride) return b.paymentModeOverride;
  }
  return s.paymentMode;
}
