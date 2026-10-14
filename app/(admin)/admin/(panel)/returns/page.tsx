import Link from "next/link";
import { db, desc, returnRequests } from "@/db";
import { aud, dateShort, orderNo, returnNo } from "@/ui/format";
import { Status } from "@/ui/Status";
import { ActionForm, Submit } from "@/ui/Forms";
import { Swipeable } from "@/ui/Mobile";
import { guard } from "@/lib/admin/guard";
import { completeReturn, decideReturn } from "@/lib/admin/actions/wholesale";

export const metadata = { title: "Return approvals" };

export default async function Returns({ searchParams }: { searchParams: Promise<{ show?: string; done?: string }> }) {
  const user = await guard("returns");
  const admin = user.role === "ADMIN";
  const { show, done } = await searchParams;
  const all = await db.query.returnRequests.findMany({ orderBy: desc(returnRequests.createdAt), with: { user: true, order: { with: { business: true } } }, limit: 200 });
  const list = show === "all" ? all : all.filter((r) => r.status === "PENDING" || r.status === "APPROVED");

  return (
    <>
      <div className="spread">
        <div><p className="eyebrow">Wholesale</p><h1 className="page" style={{ marginTop: 6 }}>Return approvals</h1></div>
        <nav className="row">
          <Link className="tab" href="/admin/returns" aria-current={show !== "all" ? "page" : undefined}>Open</Link>
          <Link className="tab" href="/admin/returns?show=all" aria-current={show === "all" ? "page" : undefined}>All</Link>
        </nav>
      </div>
      <p className="dim small">Nothing is returned or refunded until an admin approves it here. Approve first, then close the return once the goods are back.</p>
      {done && <p className="note ok" role="status">{done}</p>}
      {list.length === 0 && <div className="empty">No open returns.</div>}
      <div className="cards">
        {list.map((r) => (
          <Swipeable key={r.id} approveLabel="Approve return" rejectLabel="Reject return">
          <article className={`card prox${r.status === "PENDING" ? " attn" : ""}`}>
            <div className="spread">
              <div className="row"><b className="mono">{returnNo(r.number)}</b><span>{r.order.business?.tradingName}</span><span className="dim small">order {orderNo(r.order.number)} · {dateShort(r.createdAt)}</span></div>
              <Status value={r.status} />
            </div>
            <p><b>{r.reason}</b> · {r.units} units · order paid {aud(r.order.paidCents)}</p>
            <p className="dim small">{r.details}</p>
            {r.photoIds.length > 0 ? (
              <div className="thumbs">{r.photoIds.map((id, i) => <a key={id} href={`/api/uploads/${id}`} target="_blank" rel="noopener"><img src={`/api/uploads/${id}`} alt={`Return photo ${i + 1}`} /></a>)}</div>
            ) : <p className="small dim">No photos attached.</p>}

            {r.status === "PENDING" && (admin ? (
              <ActionForm action={decideReturn} className="stack-sm">
                <input type="hidden" name="returnId" value={r.id} />
                <label className="f">Note to buyer<input type="text" name="note" placeholder="Optional. A standard note is sent if left blank." /></label>
                <div className="row">
                  <Submit className="btn btn-ok" name="decision" value="APPROVED" swipe="approve" pendingText="Saving…">Approve return</Submit>
                  <Submit className="btn btn-bad" name="decision" value="REJECTED" swipe="reject" pendingText="Saving…">Reject</Submit>
                </div>
              </ActionForm>
            ) : <p className="small dim">Waiting for an admin to decide.</p>)}

            {r.status === "APPROVED" && admin && (
              <ActionForm action={completeReturn} className="row">
                <input type="hidden" name="returnId" value={r.id} />
                <label className="f" style={{ width: 180 }}>Refund ($, optional)<input type="number" name="refund" step="0.01" min="0" placeholder="0.00" /></label>
                <Submit className="btn btn-sm prox" pendingText="Closing…">Goods received · close return</Submit>
              </ActionForm>
            )}
            {r.decisionNote && r.status !== "PENDING" && <p className="note small">{r.decisionNote}</p>}
          </article>
          </Swipeable>
        ))}
      </div>
    </>
  );
}
