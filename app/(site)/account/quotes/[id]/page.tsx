import Link from "next/link";
import { notFound } from "next/navigation";
import { and, db, eq, quotes } from "@/db";
import { effectivePaymentMode, getSettings } from "@/core/settings";
import { paymentSplit } from "@/core/pricing";
import { aud, dateShort, orderNo, quoteNo } from "@/ui/format";
import { Status } from "@/ui/Status";
import { requireBusiness } from "@/lib/session";
import { acceptQuote, declineQuote } from "@/app/actions/quotes";

export const metadata = { title: "Quote" };

export default async function QuoteDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string; expired?: string }> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireBusiness()]);
  const q = await db.query.quotes.findFirst({ where: and(eq(quotes.id, id), eq(quotes.businessId, user.businessId!)), with: { order: true } });
  if (!q) notFound();
  const settings = await getSettings();
  const mode = q.paymentMode ?? (await effectivePaymentMode(user.businessId));
  const split = q.amountCents ? paymentSplit(q.amountCents, mode, settings.depositPct) : null;
  const expired = !!q.expiresAt && q.expiresAt < new Date();
  const canAccept = q.status === "QUOTED" && !expired && user.business.status === "APPROVED";

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <Link className="btn btn-ghost btn-sm" href="/account?tab=quotes" style={{ justifySelf: "start" }}>← Quotes</Link>
      {sp.sent && <p className="note ok">Sent. We reply within two business days and email you when we do.</p>}
      {(sp.expired || (q.status === "QUOTED" && expired)) && <p className="note warn">This quote has expired. Send a new request and we&apos;ll re-price it.</p>}
      <div className="spread">
        <div><p className="eyebrow">{q.type === "QUOTE" ? "Quote" : "Enquiry"} · {dateShort(q.createdAt)}</p><h1 className="page mono">{quoteNo(q.number)}</h1></div>
        <Status value={q.status} label={q.status === "QUOTED" ? "Quote ready" : q.status === "REQUESTED" ? "With our team" : undefined} />
      </div>
      <section className="panel prox">
        <dl className="kv">
          <div><dt>Requested</dt><dd>{q.itemsText}</dd></div>
          {q.estimatedUnits > 0 && <div><dt>Units</dt><dd className="mono">{q.estimatedUnits}</dd></div>}
          {q.neededBy && <div><dt>Needed by</dt><dd>{dateShort(q.neededBy)}</dd></div>}
        </dl>
        {q.message && <p className="dim">“{q.message}”</p>}
      </section>

      {q.reply && (
        <section className="panel prox">
          <p className="eyebrow">Reply from Nepthic</p>
          {q.amountCents && <p style={{ fontSize: "1.4rem" }}><b className="mono">{aud(q.amountCents)}</b> <span className="dim small">inc GST</span></p>}
          <p>{q.reply}</p>
          {q.amountCents && split && (
            <p className="small dim">
              Terms: {mode === "DEPOSIT" ? `${settings.depositPct}% deposit (${aud(split.dueNowCents)}) now, ${aud(split.balanceCents)} before dispatch` : "full payment on acceptance"}
              {q.expiresAt && ` · valid until ${dateShort(q.expiresAt)}`}
            </p>
          )}
          {canAccept && (
            <div className="row">
              <form action={acceptQuote}><input type="hidden" name="quoteId" value={q.id} /><button className="btn btn-primary prox">Accept and pay {aud(split!.dueNowCents)}</button></form>
              <form action={declineQuote}><input type="hidden" name="quoteId" value={q.id} /><button className="btn btn-ghost">Decline</button></form>
            </div>
          )}
          {q.order && <p className="small">Converted to order <Link href={`/account/orders/${q.order.id}`} className="mono">{orderNo(q.order.number)}</Link>.</p>}
        </section>
      )}
    </div>
  );
}
