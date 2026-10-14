import { cookies } from "next/headers";
import { db, inArray, variants } from "@/db";
import { priceBulkOrder, type CartLineInput } from "@/core/pricing";
import { getSettings, getTiers } from "@/core/settings";

/* The bulk order lives in a cookie as { variantId: quantity }. Prices are always
   recomputed on the server from the database, never trusted from the browser. */

const COOKIE = "ws_cart";
export type Cart = Record<string, number>;

export async function readCart(): Promise<Cart> {
  try {
    const raw = (await cookies()).get(COOKIE)?.value;
    const parsed = raw ? JSON.parse(raw) : {};
    const out: Cart = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "number" && v > 0) out[k] = Math.floor(v);
    return out;
  } catch {
    return {};
  }
}

export async function writeCart(cart: Cart) {
  const jar = await cookies();
  if (Object.keys(cart).length === 0) jar.delete(COOKIE);
  else jar.set(COOKIE, JSON.stringify(cart), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
}

export async function cartLines(cart: Cart): Promise<CartLineInput[]> {
  const ids = Object.keys(cart);
  if (ids.length === 0) return [];
  const rows = await db.query.variants.findMany({ where: inArray(variants.id, ids), with: { product: true } });
  const byProduct = new Map<string, CartLineInput & { sort: number }>();
  for (const v of rows) {
    if (!v.product.wholesaleEnabled || v.product.archivedAt) continue;
    const line = byProduct.get(v.productId) ?? {
      productId: v.productId, productName: v.product.name, slug: v.product.slug, rrpCents: v.product.priceCents, sizes: [], sort: v.product.sortOrder,
    };
    line.sizes.push({ variantId: v.id, size: v.size, quantity: cart[v.id], stock: v.stock });
    byProduct.set(v.productId, line);
  }
  return [...byProduct.values()].sort((a, b) => a.sort - b.sort);
}

export async function priceCart() {
  const [cart, tiers, settings] = await Promise.all([readCart(), getTiers(), getSettings()]);
  const lines = await cartLines(cart);
  return { cart, settings, tiers, ...priceBulkOrder(lines, tiers, settings.moqPerStyle) };
}
