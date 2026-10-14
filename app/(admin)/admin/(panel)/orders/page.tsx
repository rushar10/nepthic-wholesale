import Link from "next/link";
import { db, desc, orders } from "@/db";
import { aud, dateShort, orderNo } from "@/ui/format";
import { Status } from "@/ui/Status";
import { guard } from "@/lib/admin/guard";
import { cancelOrder, requestBalance, setFulfilment, setOrderTerms } from "@/lib/admin/actions/wholesale";

export const metadata = { title: "Bulk orders" };

export default async function Orders({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await guard("orders");
  const { show } = await searchParams;
  const all = await db.query.orders.findMany({ orderBy: desc(orders.createdAt), with: { business: true, items: true }, limit: 300 });
  const list = show === "all" ? all : all.filter((o) => o.status !== "CANCELLED" && o.fulfilment !== "DELIVERED");
  const admin = user.role === "ADMIN";

  return (
    <>
      <div className="spread">
        <div><p className="eyebrow">Wholesale</p><h1 className="page" style={{ marginTop: 6 }}>Bulk orders</h1></div>
        <nav className="row">
          <Link className="tab" href="/admin/orders" aria-current={show !== "all" ? "page" : undefined}>Open</Link>
          <Link className="tab" href="/admin/orders?show=all" aria-current={show === "all" ? "page" : undefined}>All</Link>
        </nav>
      </div>
      <p className="dim small">Orders ship only once paid in full. Payment terms can change until the first payment arrives.</p>
      {list.length === 0 ? <div className="empty">No open orders.</div> : (
        <div className="cards">
          {list.map((o) => {
            const due = o.totalCents - o.paidCents;
            const units = o.items.reduce((a, i) => a + (i.variantId ? i.quantity : 0), 0);
            return (
              <article key={o.id} id={o.id} className="card prox">
                <div className="spread">
                  <div className="row"><b className="mono">{orderNo(o.number)}</b><span>{o.business?.tradingName}</span><span className="dim small">{dateShort(o.createdAt)}</span></div>
                  <div className="row"><Status value={o.status} /><Status value={o.fulfilment} /></div>
                </div>
                <dl className="kv">
                  <div><dt>Units</dt><dd className="mono">{units || "Quote"}</dd></div>
                  <div><dt>Total</dt><dd className="mono">{aud(o.totalCents)}</dd></div>
                  <div><dt>Paid</dt><dd className="mono">{aud(o.paidCents)}</dd></div>
                  <div><dt>Outstanding</dt><dd className="mono">{aud(Math.max(0, due))}</dd></div>
                  <div><dt>Terms</dt><dd>{o.paymentMode === "DEPOSIT" ? `${o.depositPct}% deposit` : "Full"}</dd></div>
                  {o.refundedCents > 0 && <div><dt>Refunded</dt><dd className="mono">{aud(o.refundedCents)}</dd></div>}
                </dl>
                <details>
                  <summary className="small dim" style={{ cursor: "pointer" }}>{o.items.length} line{o.items.length > 1 ? "s" : ""}</summary>
                  <ul className="small" style={{ margin: "8px 0 0", paddingLeft: "1.2em" }}>
                    {o.items.map((i) => <li key={i.id}>{i.description} × {i.quantity} @ {aud(i.unitPriceCents)}</li>)}
                  </ul>
                </details>
                <div className="row">
                  {o.paidCents > 0 && due > 0 && (
                    <form action={requestBalance}><input type="hidden" name="orderId" value={o.id} /><button className="btn btn-sm prox">{o.status === "BALANCE_REQUESTED" ? "Resend balance request" : `Request ${aud(due)} balance`}</button></form>
                  )}
                  {o.status === "PAID" && o.fulfilment === "IN_PRODUCTION" && (
                    <form action={setFulfilment}><input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="to" value="SHIPPED" /><button className="btn btn-sm btn-primary prox">Mark shipped</button></form>
                  )}
                  {o.fulfilment === "SHIPPED" && (
                    <form action={setFulfilment}><input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="to" value="DELIVERED" /><button className="btn btn-sm prox">Mark delivered</button></form>
                  )}
                  {admin && o.paidCents === 0 && o.status !== "CANCELLED" && (
                    <>
                      <form action={setOrderTerms} className="row">
                        <input type="hidden" name="orderId" value={o.id} />
                        <select name="paymentMode" defaultValue={o.paymentMode} aria-label="Payment terms" style={{ width: "auto" }}>
                          <option value="DEPOSIT">Deposit</option><option value="FULL">Full</option>
                        </select>
                        <button className="btn btn-sm">Set terms</button>
                      </form>
                      <form action={cancelOrder}><input type="hidden" name="orderId" value={o.id} /><button className="btn btn-sm btn-bad">Cancel unpaid order</button></form>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
