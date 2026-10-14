import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, db, eq, isNull, products, variants } from "@/db";
import { getUser, isTradeApproved } from "@/core/auth";
import { getSettings, getTiers } from "@/core/settings";
import { aud } from "@/ui/format";
import { Garment } from "@/ui/Art";
import { readCart } from "@/lib/cart";
import { BulkBuilder } from "./BulkBuilder";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await db.query.products.findFirst({
    where: and(eq(products.slug, slug), eq(products.wholesaleEnabled, true), isNull(products.archivedAt)),
    with: { variants: { orderBy: asc(variants.sortOrder) } },
  });
  if (!p) notFound();
  const [user, settings, tiers, cart] = await Promise.all([getUser(), getSettings(), getTiers(), readCart()]);
  const trade = isTradeApproved(user) && user?.role === "BUSINESS";
  const thisIds = new Set(p.variants.map((v) => v.id));
  const otherUnits = Object.entries(cart).filter(([id]) => !thisIds.has(id)).reduce((a, [, q]) => a + q, 0);
  const current = Object.fromEntries(p.variants.map((v) => [v.id, cart[v.id] ?? 0]));

  return (
    <div className="stack">
      <Link className="btn btn-ghost btn-sm" href="/catalogue" style={{ justifySelf: "start" }}>← Catalogue</Link>
      <div className="split">
        <div className="stack">
          <div className="prox" style={{ borderRadius: "var(--r)", overflow: "hidden" }}>
            <Garment category={p.category} hue={p.hue} imageUrl={p.imageUrl} alt={p.name} />
          </div>
          <div className="stack-sm">
            <p className="eyebrow">{p.category}</p>
            <h1 className="page">{p.name}</h1>
            <p className="lede">{p.description}</p>
            <dl className="kv">
              <div><dt>RRP</dt><dd className="mono">{aud(p.priceCents)}</dd></div>
              <div><dt>Sizes</dt><dd>{p.variants.map((v) => v.size).join(" · ")}</dd></div>
              <div><dt>Minimum</dt><dd>{settings.moqPerStyle} units</dd></div>
            </dl>
          </div>
        </div>
        <aside className="panel prox sticky" aria-label="Bulk order">
          {trade ? (
            <BulkBuilder
              productId={p.id}
              rrpCents={p.priceCents}
              sizes={p.variants.map((v) => ({ id: v.id, size: v.size, stock: v.stock }))}
              initial={current}
              otherUnits={otherUnits}
              tiers={tiers.map((t) => ({ minUnits: t.minUnits, maxUnits: t.maxUnits, discountPct: t.discountPct }))}
              moq={settings.moqPerStyle}
            />
          ) : user?.business?.status === "PENDING" ? (
            <p className="note warn">Your trade account is under review. Ordering opens once it&apos;s approved.</p>
          ) : (
            <div className="stack-sm">
              <h2 className="h3">Trade pricing</h2>
              <p className="dim">Sign in with an approved trade account to see your price and order by size.</p>
              <div className="row">
                <Link className="btn btn-primary prox" href={`/login?next=/catalogue/${p.slug}`}>Sign in</Link>
                <Link className="btn prox" href="/register">Apply for an account</Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
