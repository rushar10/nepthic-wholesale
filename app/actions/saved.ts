"use server";
import { and, db, eq, products, savedItems } from "@/db";
import { getUser } from "@/core/auth";

export type SaveResult = { ok: true; saved: boolean } | { ok: false; error: string; signIn?: boolean };

/** Saves or unsaves a product for the signed-in person. Called optimistically by <SaveButton>. */
export async function setSaved(itemId: string, saved: boolean): Promise<SaveResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Sign in to save products.", signIn: true };
  if (typeof itemId !== "string" || itemId.length > 64) return { ok: false, error: "That product isn't available." };
  const exists = await db.query.products.findFirst({ where: eq(products.id, itemId), columns: { id: true } });
  if (!exists) return { ok: false, error: "That product isn't available any more." };
  if (saved) await db.insert(savedItems).values({ userId: user.id, itemId }).onConflictDoNothing();
  else await db.delete(savedItems).where(and(eq(savedItems.userId, user.id), eq(savedItems.itemId, itemId)));
  return { ok: true, saved };
}
