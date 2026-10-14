import { z } from "zod";

/* "Nepthic catalogue feed v1": the JSON the Clothing site publishes and Wholesale imports.
   Pure (no database), so it can be unit tested and reused by the Clothing side.
   Full description: docs/catalogue-feed.md. */
export const Feed = z.object({
  version: z.literal(1),
  generatedAt: z.string().optional(),
  currency: z.literal("AUD").default("AUD"),
  products: z.array(z.object({
    id: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/, "slugs are lowercase letters, numbers and dashes"),
    name: z.string().min(1),
    category: z.string().default("Other"),
    description: z.string().default(""),
    priceCents: z.number().int().positive(),
    imageUrl: z.string().url().nullable().optional(),
    active: z.boolean().default(true),
    sizes: z.array(z.object({ size: z.string().min(1), sku: z.string().min(1) })).min(1),
  })).max(5000),
});
export type CatalogueFeed = z.infer<typeof Feed>;


/** Validates a parsed feed. Throws a readable error; never returns partial data. */
export function parseFeed(raw: unknown): CatalogueFeed {
  const parsed = Feed.safeParse(raw);
  if (!parsed.success) throw new Error(`The catalogue feed isn't valid: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  const ids = new Set<string>();
  for (const p of parsed.data.products) {
    if (ids.has(p.id)) throw new Error(`The catalogue feed lists product ${p.id} twice.`);
    ids.add(p.id);
  }
  return parsed.data;
}
