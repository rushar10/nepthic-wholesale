import Link from "next/link";
import { and, asc, db, eq, isNull, products } from "@/db";
import { getUser, isTradeApproved } from "@/core/auth";
import { getSettings, getTiers } from "@/core/settings";
import { tradeUnitCents } from "@/core/pricing";
import { aud } from "@/ui/format";
import { Garment } from "@/ui/Art";

export default async function Home() {
  const [user, settings, tiers] = await Promise.all([getUser(), getSettings(), getTiers()]);
  const trade = isTradeApproved(user);
  const featured = await db.query.products.findMany({ where: and(eq(products.wholesaleEnabled, true), isNull(products.archivedAt)), orderBy: asc(products.sortOrder), limit: 4 });
  const top = tiers.at(-1)?.discountPct ?? 0;

  return (
    <div className="stack">
      <section className="hero">
        <p className="eyebrow">Nepthic Wholesale · trade only</p>
        <h1>Stock Nepthic in your store.</h1>
        <p className="lede">
          Order from {settings.moqPerStyle} units per style. Your price drops as the order grows, and our team answers custom
          quotes within two business days. Trade prices are shown ex GST.
        </p>
        <div className="tiers">
          {tiers.map((t) => (
            <div className="tier prox" key={t.id}>
              <b>{t.discountPct}% off</b>
              <span>{t.minUnits}{t.maxUnits ? `–${t.maxUnits}` : "+"} units per order</span>
            </div>
          ))}
          <div className="tier prox">
            <b>{settings.paymentMode === "DEPOSIT" ? `${settings.depositPct}%` : "100%"}</b>
            <span>{settings.paymentMode === "DEPOSIT" ? "deposit up front, balance before dispatch" : "paid at checkout"}</span>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <Link className="btn btn-primary prox" href="/catalogue">Browse the catalogue</Link>
          {!user && <Link className="btn prox" href="/register">Apply for a trade account</Link>}
          <Link className="btn btn-ghost" href="/quote">Request a custom quote</Link>
        </div>
      </section>

      {!trade && (
        <p className="note">
          {user?.business?.status === "PENDING"
            ? "Your trade account is being reviewed. You'll see trade prices as soon as it's approved."
            : "Trade prices are visible to approved stockists. Prices below are RRP."}
        </p>
      )}

      <section className="stack-sm">
        <div className="spread"><h2>Core range</h2><Link className="link" href="/catalogue">See everything</Link></div>
        <div className="cat">
          {featured.map((p) => (
            <Link key={p.id} className="prod prox" href={`/catalogue/${p.slug}`}>
              <Garment category={p.category} hue={p.hue} imageUrl={p.imageUrl} alt={p.name} />
              <span className="prod-meta"><span className="prod-name">{p.name}</span><span className="prod-cat">{p.category}</span></span>
              <span className="prod-price">
                {trade ? <span>Trade from <span className="mono">{aud(tradeUnitCents(p.priceCents, top))}</span></span> : <span />}
                <span className="dim">RRP {aud(p.priceCents)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
