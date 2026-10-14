import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, catalogueImports, db, eq, inArray, isNotNull, isNull, not, products, variants } from "@/db";
import { env } from "./env";
import { parseFeed, type CatalogueFeed } from "./catalogue-feed";
export type { CatalogueFeed };

/* Copies the Clothing catalogue into this site's own database.

   - Runs on a schedule (Vercel Cron → /api/cron/catalogue-import), from the admin's
     "Import now" button, or `npm run catalogue:import`. Never while serving a page.
   - Reads the "Nepthic catalogue feed v1" JSON (docs/catalogue-feed.md) from
     CLOTHING_CATALOGUE_URL: an https URL on the Clothing site, or a file: path.
   - Updates names, descriptions, categories, RRPs, images and adds new sizes.
     Wholesale-owned fields are never overwritten: stock allocation, "listed on
     Wholesale", sort order and placeholder artwork.
   - Products that leave the feed are archived (hidden, kept for past orders), not deleted.
   - If the feed is unreachable or invalid, nothing changes: Wholesale keeps selling from
     its last good copy and the failure is logged for the admin. */

export type ImportResult = { ok: true; created: number; updated: number; archived: number } | { ok: false; error: string };

/** Hides credentials in logged URLs. */
const redact = (u: string) => u.replace(/\/\/[^@/]+@/, "//***@").replace(/([?&](token|key)=)[^&]+/gi, "$1***");

/** Stable placeholder colour per product until real images are linked. */
const hueFor = (slug: string) => [...slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export async function fetchFeed(url = env.catalogueUrl): Promise<CatalogueFeed> {
  let raw: unknown;
  if (url.startsWith("file:")) {
    raw = JSON.parse(await readFile(path.resolve(process.cwd(), url.slice(5)), "utf8"));
  } else {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { accept: "application/json", ...(env.catalogueToken ? { authorization: `Bearer ${env.catalogueToken}` } : {}) },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
    } catch (e) {
      const why = e instanceof Error && e.name === "TimeoutError" ? "no answer within 15 seconds" : ((e as { cause?: { code?: string } })?.cause?.code ?? "network error");
      throw new Error(`Couldn't reach the Clothing catalogue feed at ${new URL(url).host} (${why}).`);
    }
    if (!res.ok) throw new Error(`The Clothing catalogue feed answered ${res.status}.`);
    raw = await res.json();
  }
  return parseFeed(raw);
}

export async function importCatalogue(trigger: "schedule" | "admin" | "cli", url = env.catalogueUrl): Promise<ImportResult> {
  const [run] = await db.insert(catalogueImports).values({ source: redact(url), trigger }).returning();
  try {
    const feed = await fetchFeed(url);
    const counts = await db.transaction(async (tx) => {
      const now = new Date();
      let created = 0, updated = 0;
      const seen: string[] = [];
      for (const [i, p] of feed.products.entries()) {
        if (!p.active) continue;
        seen.push(p.id);
        const existing = await tx.query.products.findFirst({ where: eq(products.sourceId, p.id), with: { variants: true } });
        let productId: string;
        if (existing) {
          const slugFree = existing.slug === p.slug || !(await tx.query.products.findFirst({ where: eq(products.slug, p.slug) }));
          await tx.update(products).set({
            name: p.name, category: p.category, description: p.description, priceCents: p.priceCents,
            imageUrl: p.imageUrl ?? null, slug: slugFree ? p.slug : existing.slug, syncedAt: now, archivedAt: null,
          }).where(eq(products.id, existing.id));
          productId = existing.id;
          updated++;
        } else {
          const clash = await tx.query.products.findFirst({ where: eq(products.slug, p.slug) });
          const [row] = await tx.insert(products).values({
            sourceId: p.id, slug: clash ? `${p.slug}-${p.id.slice(-4).toLowerCase()}` : p.slug,
            name: p.name, category: p.category, description: p.description, priceCents: p.priceCents,
            imageUrl: p.imageUrl ?? null, hue: hueFor(p.slug), sortOrder: 100 + i, syncedAt: now,
          }).returning();
          productId = row.id;
          created++;
        }
        // New sizes arrive with zero wholesale stock; existing sizes keep their allocation.
        const have = existing?.variants ?? [];
        for (const [j, s] of p.sizes.entries()) {
          if (have.some((v) => v.sku === s.sku || v.size === s.size)) continue;
          await tx.insert(variants).values({ productId, size: s.size, sku: s.sku, stock: 0, sortOrder: have.length + j }).onConflictDoNothing();
        }
      }
      // Imported products that are no longer in the feed (or are inactive) are archived, not deleted.
      const gone = await tx.update(products).set({ archivedAt: now })
        .where(and(isNotNull(products.sourceId), isNull(products.archivedAt), seen.length ? not(inArray(products.sourceId, seen)) : undefined))
        .returning({ id: products.id });
      return { created, updated, archived: gone.length };
    });
    await db.update(catalogueImports).set({ status: "SUCCEEDED", ...counts, finishedAt: new Date() }).where(eq(catalogueImports.id, run.id));
    return { ok: true, ...counts };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.update(catalogueImports).set({ status: "FAILED", error: error.slice(0, 500), finishedAt: new Date() }).where(eq(catalogueImports.id, run.id));
    console.error("[catalogue import] failed:", error);
    return { ok: false, error };
  }
}
