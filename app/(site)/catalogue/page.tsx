import Link from "next/link";
import { and, asc, db, eq, isNull, products } from "@/db";
import { getUser, isTradeApproved } from "@/core/auth";
import { getSettings, getTiers } from "@/core/settings";
import { tradeUnitCents } from "@/core/pricing";
import { aud } from "@/ui/format";
import { Garment } from "@/ui/Art";

export const metadata = { title: "Catalogue" };

export default async function Catalogue({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const [user, settings, tiers] = await Promise.all([getUser(), getSettings(), getTiers()]);
  const trade = isTradeApproved(user);
  const all = await db.query.products.findMany({ where: and(eq(products.wholesaleEnabled, true), isNull(products.archivedAt)), orderBy: asc(products.sortOrder), with: { variants: true } });
  const cats = [...new Set(all.map((p) => p.category))];
  const list = category ? all.filter((p) => p.category === category) : all;
  const top = tiers.at(-1)?.discountPct ?? 0;

  return (
    <div className="stack">
      <div className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Catalogue</p>
        <h1 className="page">The wholesale range</h1>
        <p className="lede">Minimum {settings.moqPerStyle} units per style. Mix sizes freely within a style.</p>
      </div>
      <nav className="chips" aria-label="Categories">
        <Link className="tab" href="/catalogue" aria-current={!category ? "page" : undefined}>All</Link>
        {cats.map((c) => (
          <Link key={c} className="tab" href={`/catalogue?category=${encodeURIComponent(c)}`} aria-current={category === c ? "page" : undefined}>{c}</Link>
        ))}
      </nav>
      {!trade && <p className="note">Sign in with an approved trade account to see trade pricing and order.</p>}
      <div className="cat">
        {list.map((p) => {
          const stock = p.variants.reduce((a, v) => a + v.stock, 0);
          return (
            <Link key={p.id} className="prod prox" href={`/catalogue/${p.slug}`}>
              <Garment category={p.category} hue={p.hue} imageUrl={p.imageUrl} alt={p.name} />
              <span className="prod-meta">
                <span className="prod-name">{p.name}</span>
                <span className="prod-cat">{p.category} · {p.variants.length > 1 ? `${p.variants[0].size}–${p.variants.at(-1)!.size}` : "One size"} · {stock} in stock</span>
              </span>
              <span className="prod-price">
                {trade ? <span>Trade from <span className="mono">{aud(tradeUnitCents(p.priceCents, top))}</span></span> : <span />}
                <span className="dim">RRP {aud(p.priceCents)}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
