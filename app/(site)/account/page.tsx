import Link from "next/link";
import { desc, db, eq, inArray, orders, quotes, returnRequests } from "@/db";
import { formatAbn } from "@/core/abn";
import { aud, dateShort, orderNo, quoteNo, returnNo } from "@/ui/format";
import { Status } from "@/ui/Status";
import { requireBusiness } from "@/lib/session";

export const metadata = { title: "Account" };

type Tab = "orders" | "quotes" | "returns";

export default async function Account({ searchParams }: { searchParams: Promise<{ tab?: string; welcome?: string; pending?: string; sent?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = sp.tab === "quotes" || sp.tab === "returns" ? sp.tab : "orders";
  const user = await requireBusiness();
  const b = user.business;

  const [myOrders, myQuotes] = await Promise.all([
    db.query.orders.findMany({ where: eq(orders.businessId, b.id), orderBy: desc(orders.createdAt) }),
    db.query.quotes.findMany({ where: eq(quotes.businessId, b.id), orderBy: desc(quotes.createdAt) }),
  ]);
  const myReturns = myOrders.length
    ? await db.query.returnRequests.findMany({ where: inArray(returnRequests.orderId, myOrders.map((o) => o.id)), orderBy: desc(returnRequests.createdAt), with: { order: true } })
    : [];
  const returnable = myOrders.filter((o) => o.fulfilment === "SHIPPED" || o.fulfilment === "DELIVERED");

  return (
    <div className="stack">
      {sp.welcome && <p className="note ok">Application received. We&apos;ll email you when your trade account is approved.</p>}
      {b.status === "PENDING" && !sp.welcome && <p className="note warn">Your trade account is under review. You can send enquiries now; ordering opens once it&apos;s approved.</p>}
      {b.status === "REJECTED" && <p className="note bad">Your trade application wasn&apos;t approved. Reply to our email or send an enquiry if you&apos;d like us to take another look.</p>}

      <div className="row prox panel" style={{ display: "flex" }}>
        <div className="avatar" aria-hidden="true">{b.tradingName[0]}</div>
        <div style={{ minWidth: 0 }}>
          <b>{b.tradingName}</b>
          <div className="dim small">ABN {formatAbn(b.abn)} · {user.name} · {b.city} {b.state}</div>
        </div>
        <span style={{ marginLeft: "auto" }}><Status value={b.status} label={b.status === "APPROVED" ? "Approved trade account" : undefined} /></span>
      </div>

      <nav className="tabs" aria-label="Account sections">
        {([["orders", "Orders", myOrders.length], ["quotes", "Quotes & enquiries", myQuotes.length], ["returns", "Returns", myReturns.length]] as const).map(([k, l, n]) => (
          <Link key={k} className="tab" href={`/account?tab=${k}`} aria-current={tab === k ? "page" : undefined}>{l}<span className="count">{n}</span></Link>
        ))}
      </nav>

      {tab === "orders" && (myOrders.length === 0 ? <div className="empty">No orders yet. <Link href="/catalogue">Start a bulk order</Link>.</div> : (
        <div className="cards">
          {myOrders.map((o) => (
            <Link key={o.id} href={`/account/orders/${o.id}`} className="card prox">
              <div className="spread"><b className="mono">{orderNo(o.number)}</b><div className="row"><Status value={o.status} /><Status value={o.fulfilment} /></div></div>
              <dl className="kv">
                <div><dt>Placed</dt><dd>{dateShort(o.createdAt)}</dd></div>
                <div><dt>Total inc GST</dt><dd className="mono">{aud(o.totalCents)}</dd></div>
                <div><dt>Paid</dt><dd className="mono">{aud(o.paidCents)}</dd></div>
                <div><dt>Terms</dt><dd>{o.paymentMode === "DEPOSIT" ? `${o.depositPct}% deposit` : "Full payment"}</dd></div>
              </dl>
            </Link>
          ))}
        </div>
      ))}

      {tab === "quotes" && (
        <div className="stack-sm">
          {sp.sent && <p className="note ok">Sent. We reply within two business days.</p>}
          <div className="row"><Link className="btn btn-sm prox" href="/quote">New enquiry or quote</Link></div>
          {myQuotes.length === 0 ? <div className="empty">No quotes yet.</div> : (
            <div className="cards">
              {myQuotes.map((q) => (
                <Link key={q.id} href={`/account/quotes/${q.id}`} className={`card prox${q.status === "QUOTED" ? " attn" : ""}`}>
                  <div className="spread"><div className="row"><b className="mono">{quoteNo(q.number)}</b><span className="dim small">{q.type === "QUOTE" ? "Quote" : "Enquiry"} · {dateShort(q.createdAt)}</span></div><Status value={q.status} label={q.status === "QUOTED" ? "Quote ready" : undefined} /></div>
                  <p>{q.itemsText}</p>
                  {q.status === "QUOTED" && q.amountCents && <p className="small"><b>{aud(q.amountCents)}</b> inc GST · review and accept</p>}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "returns" && (
        <div className="stack-sm">
          {sp.sent && <p className="note ok">Return request sent. Please hold the items until we reply.</p>}
          <p className="dim small">Returns are reviewed by the Nepthic team. Nothing should be sent back until a request is approved.</p>
          {returnable.length > 0 && <div className="row"><Link className="btn btn-sm prox" href="/account/returns/new">Request a return</Link></div>}
          {myReturns.length === 0 ? <div className="empty">No return requests.</div> : (
            <div className="cards">
              {myReturns.map((r) => (
                <div key={r.id} className="card prox">
                  <div className="spread"><b className="mono">{returnNo(r.number)}</b><Status value={r.status} label={r.status === "PENDING" ? "Under review" : undefined} /></div>
                  <p className="small"><span className="mono">{orderNo(r.order.number)}</span> · {r.reason} · {r.units} units · {r.photoIds.length} photo{r.photoIds.length === 1 ? "" : "s"}</p>
                  <p className="dim small">{r.details}</p>
                  {r.decisionNote && <p className={`note ${r.status === "REJECTED" ? "bad" : "ok"}`}>Nepthic: {r.decisionNote}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
