import Link from "next/link";
import { asc, businesses, db, desc, eq, quotes, returnRequests } from "@/db";
import { Icon } from "@/ui/Icons";
import { dateShort, quoteNo, returnNo } from "@/ui/format";
import { guard } from "@/lib/admin/guard";
import { pendingCounts } from "@/lib/admin/counts";

export const metadata = { title: "Approvals" };

/* Everything waiting on a decision, on Wholesale, oldest first within each queue. */
export default async function Approvals() {
  await guard("approvals");
  const [p, q, ret, biz] = await Promise.all([
    pendingCounts(),
    db.query.quotes.findMany({ where: eq(quotes.status, "REQUESTED"), with: { business: true }, orderBy: asc(quotes.createdAt), limit: 20 }),
    db.query.returnRequests.findMany({ where: eq(returnRequests.status, "PENDING"), with: { order: { with: { business: true } } }, orderBy: asc(returnRequests.createdAt), limit: 20 }),
    db.query.businesses.findMany({ where: eq(businesses.status, "PENDING"), orderBy: desc(businesses.createdAt), limit: 20 }),
  ]);

  const queues = [
    { key: "quotes", label: "Quote requests", n: p.quotes, href: "/admin/quotes", c: "var(--ws)", icon: "quote" },
    { key: "returns", label: "Returns", n: p.returns, href: "/admin/returns", c: "var(--ws)", icon: "undo" },
    { key: "accounts", label: "Trade accounts", n: p.businesses, href: "/admin/businesses", c: "var(--ws)", icon: "user" },
  ];

  const rows = [
    ...q.map((x) => ({ id: x.id, c: "var(--ws)", icon: "quote", title: `${quoteNo(x.number)} · ${x.business.tradingName}`, detail: x.itemsText, when: x.createdAt, href: `/admin/quotes#${x.id}`, action: "Respond" })),
    ...ret.map((x) => ({ id: x.id, c: "var(--ws)", icon: "undo", title: `${returnNo(x.number)} · ${x.order.business?.tradingName ?? "Customer"}`, detail: `${x.reason} · ${x.units} units`, when: x.createdAt, href: "/admin/returns", action: "Review" })),
    ...biz.map((x) => ({ id: x.id, c: "var(--ws)", icon: "user", title: x.tradingName, detail: `New trade account · ABN ${x.abn} · ${x.city} ${x.state}`, when: x.createdAt, href: "/admin/businesses", action: "Review" })),
  ].sort((a, b) => a.when.getTime() - b.when.getTime());

  return (
    <>
      <div className="dash-head"><h1>Approvals</h1><span className="muted">{p.total ? `${p.total} waiting on the team` : "Nothing waiting"}</span></div>
      <div className="dash-stack" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", display: "grid" }}>
        {queues.map((x) => (
          <Link key={x.key} href={x.href} className="dcard" data-glow style={{ textDecoration: "none", color: "inherit", ["--c" as string]: x.c }}>
            <div className="stat-top"><span className="stat-label">{x.label}</span><span className="stat-ico"><Icon name={x.icon} size={20} /></span></div>
            <span className="big">{x.n}</span>
          </Link>
        ))}
      </div>
      <section className="dcard" data-glow>
        <div className="dcard-head"><h2>Oldest first</h2></div>
        {rows.length === 0 ? <p className="muted">Nothing needs a decision right now.</p> : (
          <ul className="act">
            {rows.map((r) => (
              <li key={r.id} style={{ ["--c" as string]: r.c }}>
                <span className="act-ico"><Icon name={r.icon} size={20} /></span>
                <span style={{ minWidth: 0 }}><span className="act-name" style={{ display: "block" }}>{r.title}</span><span className="act-type" style={{ display: "block" }}>{r.detail} · {dateShort(r.when)}</span></span>
                <Link className="btn-pill" style={{ height: 40, padding: "0 16px" }} href={r.href}>{r.action}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
