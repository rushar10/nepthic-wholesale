"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, eq, products, variants } from "@/db";
import { audit } from "@/core/audit";
import { importCatalogue } from "@/core/catalogue-import";
import { cents, int, str, type FormState } from "@/core/forms";
import { requireStaff } from "@/lib/admin/guard";
import { run } from "@/lib/admin/run";

export async function saveProduct(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const staff = await requireStaff();
    const id = str(fd, "productId");
    const p = await db.query.products.findFirst({ where: eq(products.id, id), with: { variants: true } });
    if (!p) return { error: "Product not found." };
    // Imported products keep the Clothing catalogue's RRP, name, image and sizes.
    const imported = !!p.sourceId;
    const priceCents = imported ? p.priceCents : cents(fd, "price");
    if (priceCents <= 0) return { error: "Enter the RRP." };
    await db.transaction(async (tx) => {
      await tx.update(products).set(imported
        ? { wholesaleEnabled: fd.get("wholesaleEnabled") === "on" }
        : { priceCents, wholesaleEnabled: fd.get("wholesaleEnabled") === "on", imageUrl: str(fd, "imageUrl") || null },
      ).where(eq(products.id, id));
      for (const v of p.variants) {
        if (fd.has(`stock_${v.id}`)) await tx.update(variants).set({ stock: Math.max(0, int(fd, `stock_${v.id}`)) }).where(eq(variants.id, v.id));
      }
      const newSize = str(fd, "newSize");
      if (!imported && newSize && !p.variants.some((v) => v.size.toLowerCase() === newSize.toLowerCase())) {
        await tx.insert(variants).values({ productId: id, size: newSize, sku: `${p.slug.toUpperCase()}-${newSize.toUpperCase()}`, stock: Math.max(0, int(fd, "newStock")), sortOrder: p.variants.length });
      }
    });
    await audit(staff.id, "product.updated", "Product", id);
    revalidatePath("/admin/products");
    return { ok: `${p.name} saved.` };
  });
}

export async function createProduct(_: FormState, fd: FormData): Promise<FormState> {
  let slug = "";
  const r = await run(async () => {
    const staff = await requireStaff();
    const name = str(fd, "name");
    slug = (str(fd, "slug") || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const sizes = str(fd, "sizes").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    const priceCents = cents(fd, "price");
    if (!name || !sizes.length || priceCents <= 0) return { error: "Name, RRP and at least one size are required." };
    if (await db.query.products.findFirst({ where: eq(products.slug, slug) })) return { error: `A product already uses /${slug}.` };
    const stock = Math.max(0, int(fd, "stock"));
    const [p] = await db.insert(products).values({
      name, slug, category: str(fd, "category") || "Tees", priceCents, description: str(fd, "description"),
      hue: Math.floor(Math.random() * 360), wholesaleEnabled: fd.get("wholesaleEnabled") === "on",
    }).returning();
    await db.insert(variants).values(sizes.map((size, i) => ({ productId: p.id, size, sku: `${slug.toUpperCase()}-${size.toUpperCase()}`, stock, sortOrder: i })));
    await audit(staff.id, "product.created", "Product", p.id);
    return { ok: "Created." };
  });
  if (r?.ok) redirect(`/admin/products#${slug}`);
  return r;
}

/** "Import now" on the Products page. */
export async function runImport(_: FormState, __: FormData): Promise<FormState> {
  return run(async () => {
    const staff = await requireStaff();
    const r = await importCatalogue("admin");
    await audit(staff.id, "catalogue.import", "Catalogue", "clothing", r);
    revalidatePath("/admin/products");
    return r.ok
      ? { ok: `Imported: ${r.created} new, ${r.updated} updated, ${r.archived} archived.` }
      : { error: `Import failed, so nothing changed and Wholesale keeps its last good copy. ${r.error}` };
  });
}
