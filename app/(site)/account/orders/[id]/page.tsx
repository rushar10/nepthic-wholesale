import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, db, eq, orders, payments } from "@/db";
import { paymentSplit } from "@/core/pricing";
import { aud, dateShort, orderNo } from "@/ui/format";
import { Status } from "@/ui/Status";
import { requireBusiness } from "@/lib/session";
import { payOutstanding } from "@/app/actions/order";

export const metadata = { title: "Order" };

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string }> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireBusiness()]);
  const o = await db.query.orders.findFirst({
    where: and(eq(orders.id, id), eq(orders.businessId, user.businessId!)),
    with: { items: true, payments: { orderBy: asc(payments.createdAt) }, returns: true },
  });
  if (!o) notFound();
  const due = o.totalCents - o.paidCents;
  const firstDue = o.paidCents === 0 && o.paymentMode === "DEPOSIT" ? paymentSplit(o.totalCents, "DEPOSIT", o.depositPct).dueNowCents : due;
  const done = o.payments.filter((p) => p.status === "SUCCEEDED");

  return (
    <div className="stack">
      <Link className="btn btn-ghost btn-sm" href="/account" style={{ justifySelf: "start" }}>← Account</Link>
      {sp.paid && <p className="note ok">Payment received. A receipt is on its way to {user.email}.</p>}
      <div className="spread">
        <div><p className="eyebrow">Order</p><h1 className="page mono">{orderNo(o.number)}</h1></div>
        <div className="row"><Status value={o.status} /><Status value={o.fulfilment} /></div>
      </div>

      <div className="split">
        <section className="panel prox">
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit ex GST</th><th className="num">Total</th></tr></thead>
              <tbody>
                {o.items.map((it) => (
                  <tr key={it.id}><td>{it.description}</td><td className="num">{it.quantity}</td><td className="num">{aud(it.unitPriceCents)}</td><td className="num">{aud(it.unitPriceCents * it.quantity)}</td></tr>
                ))}
                <tr><td colSpan={3}>Subtotal ex GST{o.tierDiscountPct ? ` (${o.tierDiscountPct}% volume tier)` : ""}</td><td className="num">{aud(o.subtotalCents)}</td></tr>
                <tr><td colSpan={3}>GST</td><td className="num">{aud(o.gstCents)}</td></tr>
                <tr><td colSpan={3}><b>Total</b></td><td className="num"><b>{aud(o.totalCents)}</b></td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel prox">
          <h2 className="h3">Payment</h2>
          <dl className="kv">
            <div><dt>Terms</dt><dd>{o.paymentMode === "DEPOSIT" ? `${o.depositPct}% deposit + balance` : "Full payment"}</dd></div>
            <div><dt>Paid</dt><dd className="mono">{aud(o.paidCents)}</dd></div>
            <div><dt>Outstanding</dt><dd className="mono">{aud(Math.max(due, 0))}</dd></div>
            {o.balanceDueAt && due > 0 && <div><dt>Due by</dt><dd>{dateShort(o.balanceDueAt)}</dd></div>}
          </dl>
          {due > 0 && o.status !== "CANCELLED" && (
            <form action={payOutstanding}>
              <input type="hidden" name="orderId" value={o.id} />
              <button className="btn btn-primary prox">
                {o.paidCents === 0 ? `Pay ${aud(firstDue)}${o.paymentMode === "DEPOSIT" ? " deposit" : ""}` : `Pay ${aud(due)} balance`}
              </button>
            </form>
          )}
          {o.paidCents > 0 && due > 0 && o.status !== "BALANCE_REQUESTED" && <p className="dim small">We&apos;ll email you when the balance is due, before dispatch.</p>}
          {done.length > 0 && (
            <ul className="stack-sm small" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {done.map((p) => <li key={p.id} className="spread"><span>{p.description}</span><span className="mono">{aud(p.amountCents)}</span></li>)}
            </ul>
          )}
          {(o.fulfilment === "SHIPPED" || o.fulfilment === "DELIVERED") && (
            <Link className="btn btn-sm prox" href={`/account/returns/new?order=${o.id}`}>Request a return</Link>
          )}
        </aside>
      </div>
    </div>
  );
}
