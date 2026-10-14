import Link from "next/link";
import { db, desc, quotes } from "@/db";
import { getSettings } from "@/core/settings";
import { aud, dateShort, orderNo, quoteNo } from "@/ui/format";
import { Status } from "@/ui/Status";
import { ActionForm, Submit } from "@/ui/Forms";
import { guard } from "@/lib/admin/guard";
import { respondToQuote } from "@/lib/admin/actions/wholesale";

export const metadata = { title: "Quotes" };

export default async function Quotes({ searchParams }: { searchParams: Promise<{ show?: string; done?: string }> }) {
  await guard("quotes");
  const { show, done } = await searchParams;
  const s = await getSettings();
  const all = await db.query.quotes.findMany({ orderBy: desc(quotes.createdAt), with: { business: true, user: true, order: true }, limit: 200 });
  const open = all.filter((q) => q.status === "REQUESTED");
  const list = show === "all" ? all : open;

  return (
    <>
      <div className="spread">
        <div><p className="eyebrow">Wholesale</p><h1 className="page" style={{ marginTop: 6 }}>Quotes &amp; enquiries</h1></div>
        <nav className="row">
          <Link className="tab" href="/admin/quotes" aria-current={show !== "all" ? "page" : undefined}>Waiting<span className="count">{open.length}</span></Link>
          <Link className="tab" href="/admin/quotes?show=all" aria-current={show === "all" ? "page" : undefined}>All</Link>
        </nav>
      </div>
      {done && <p className="note ok" role="status">{done}</p>}
      {list.length === 0 && <div className="empty">No requests waiting.</div>}
      <div className="cards">
        {list.map((q) => (
          <article key={q.id} id={q.id} className={`card prox${q.status === "REQUESTED" ? " attn" : ""}`}>
            <div className="spread">
              <div className="row"><b className="mono">{quoteNo(q.number)}</b><span>{q.business.tradingName}</span><span className="dim small">{q.type === "QUOTE" ? "Quote" : "Enquiry"} · {dateShort(q.createdAt)}</span></div>
              <Status value={q.status} label={q.status === "REQUESTED" ? "Waiting" : undefined} />
            </div>
            <p><b>{q.itemsText}</b>{q.estimatedUnits > 0 && <> · <span className="mono">{q.estimatedUnits}</span> units</>}{q.neededBy && <> · needed by {dateShort(q.neededBy)}</>}</p>
            {q.message && <p className="dim small">“{q.message}” — {q.user.name}, {q.user.email}</p>}

            {q.status === "REQUESTED" ? (
              <ActionForm action={respondToQuote} className="stack-sm">
                <input type="hidden" name="quoteId" value={q.id} />
                <div className="form-grid">
                  {q.type === "QUOTE" && (
                    <>
                      <label className="f">Quote total inc GST ($)<input type="number" name="amount" step="0.01" min="0" placeholder="0.00" /></label>
                      <label className="f">Payment terms
                        <select name="paymentMode" defaultValue="">
                          <option value="">Default ({s.paymentMode === "DEPOSIT" ? `${s.depositPct}% deposit` : "full payment"})</option>
                          <option value="FULL">Full payment</option>
                          <option value="DEPOSIT">{s.depositPct}% deposit + balance</option>
                        </select>
                      </label>
                    </>
                  )}
                  <label className="f full">{q.type === "QUOTE" ? "Message to buyer" : "Reply"}<textarea name="reply" placeholder={q.type === "QUOTE" ? "What's included, lead time, freight." : "Your answer"} /></label>
                </div>
                <div className="row">
                  <Submit className="btn btn-primary btn-sm prox" name="decision" value="send" optimistic="Sent" pendingText="Sending…">{q.type === "QUOTE" ? `Send quote (valid ${s.quoteValidDays} days)` : "Send reply"}</Submit>
                  <Submit className="btn btn-bad btn-sm" name="decision" value="decline" optimistic="Declined" pendingText="Declining…">Decline</Submit>
                </div>
              </ActionForm>
            ) : (
              <div className="small">
                {q.amountCents != null && <span><b className="mono">{aud(q.amountCents)}</b> · {q.paymentMode ? (q.paymentMode === "DEPOSIT" ? "deposit terms" : "full payment") : "default terms"} · </span>}
                {q.reply && <span className="dim">“{q.reply}”</span>}
                {q.order && <> · became <Link className="mono" href={`/admin/orders#${q.order.id}`}>{orderNo(q.order.number)}</Link></>}
                {q.expiresAt && q.status === "QUOTED" && <span className="dim"> · expires {dateShort(q.expiresAt)}</span>}
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
