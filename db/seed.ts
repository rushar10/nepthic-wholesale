/* Seeds Wholesale's own database: settings, volume tiers, staff, a demo buyer, and the
   product catalogue (imported from the Clothing feed exactly as the scheduled job does).
   Safe to run more than once. Nothing here touches the Clothing or Events databases. */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { importCatalogue } from "../core/catalogue-import";
import { businesses, db, pool, priceTiers, products, settings, users, variants, type Role } from "./index";
import { seedSampleHistory } from "./seed-history";

// Demo wholesale allocation per size (Clothing's feed carries no stock; Wholesale owns its own).
const DEMO_STOCK: Record<string, number[]> = {
  "void-hoodie": [40, 85, 90, 52, 18],
  "orbit-tee": [120, 210, 190, 96, 40],
  "static-cargo-pant": [30, 64, 70, 48, 20],
  "eclipse-crewneck": [36, 70, 66, 40, 12],
  "drift-track-jacket": [20, 44, 48, 30, 10],
  "signal-cap": [260],
};

async function user(email: string, name: string, role: Role, password: string, businessId?: string) {
  const found = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (found) return found;
  const [u] = await db.insert(users).values({ email, name, role, businessId, passwordHash: await bcrypt.hash(password, 12) }).returning();
  return u;
}

async function main() {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();

  if ((await db.select().from(priceTiers)).length === 0) {
    await db.insert(priceTiers).values([
      { minUnits: 24, maxUnits: 99, discountPct: 25 },
      { minUnits: 100, maxUnits: 249, discountPct: 35 },
      { minUnits: 250, maxUnits: null, discountPct: 45 },
    ]);
  }

  // Products: a copy of the Clothing catalogue, via the same import the schedule runs.
  const imported = await importCatalogue("cli");
  if (!imported.ok) console.warn("Catalogue import failed (Wholesale still works, just with no products yet):", imported.error);
  else console.log(`Catalogue: ${imported.created} new, ${imported.updated} updated, ${imported.archived} archived.`);

  if (process.env.NODE_ENV !== "production") {
    for (const [slug, stock] of Object.entries(DEMO_STOCK)) {
      const p = await db.query.products.findFirst({ where: eq(products.slug, slug), with: { variants: true } });
      if (!p || p.variants.some((v) => v.stock > 0)) continue;
      const sorted = [...p.variants].sort((a, b) => a.sortOrder - b.sortOrder);
      for (const [i, v] of sorted.entries()) await db.update(variants).set({ stock: stock[i] ?? 0 }).where(eq(variants.id, v.id));
    }
    // The limited drop stays retail-only.
    await db.update(products).set({ wholesaleEnabled: false }).where(eq(products.slug, "drop-07-tee"));
  }

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "change-me-now";
  await user(process.env.SEED_ADMIN_EMAIL || "admin@wholesale.nepthic.com", "Wholesale Admin", "ADMIN", adminPassword);

  // Demo accounts for local testing only.
  if (process.env.NODE_ENV !== "production") {
    await user("staff@wholesale.nepthic.com", "Wholesale Staff", "STAFF", adminPassword);
    let biz = await db.query.businesses.findFirst({ where: eq(businesses.abn, "51824753556") });
    if (!biz) {
      [biz] = await db.insert(businesses).values({
        legalName: "Kinfolk Supply Pty Ltd", tradingName: "Kinfolk Supply Co.", abn: "51824753556",
        phone: "07 3000 1234", address: "12 Example Lane", city: "Brisbane", state: "QLD", postcode: "4000", status: "APPROVED",
      }).returning();
    }
    await user("buyer@example.com", "Mia Tran", "BUSINESS", "demo-password", biz.id);

    // A year of sample trading so the admin dashboard has data (skipped with SEED_SAMPLE_HISTORY=0).
    await seedSampleHistory(await bcrypt.hash("demo-password", 10));
  }
  console.log("Seeded. Admin login:", process.env.SEED_ADMIN_EMAIL || "admin@wholesale.nepthic.com");
}

main().finally(() => pool.end());
