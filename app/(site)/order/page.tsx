import Link from "next/link";
import { getUser } from "@/core/auth";
import { effectivePaymentMode } from "@/core/settings";
import { nextTier, paymentSplit } from "@/core/pricing";
import { aud } from "@/ui/format";
import { ActionForm, Submit } from "@/ui/Forms";
import { priceCart } from "@/lib/cart";
import { requireApprovedBusiness } from "@/lib/session";
import { placeOrder, removeProduct } from "@/app/actions/order";

export const metadata = { title: "Bulk order" };

export default async function OrderPage() {
  await requireApprovedBusiness();
  const user = await getUser();
  const p = await priceCart();
  const mode = await effectivePaymentMode(user?.businessId);
  const split = paymentSplit(p.totalCents, mode, p.settings.depositPct);
  const next = nextTier(p.units, p.tiers);
  const retail = p.lines.reduce((a, l) => a + l.rrpCents * l.units, 0);

  return (
    <div className="stack">
      <div className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Bulk order</p>
        <h1 className="page">Review your order</h1>
      </div>

      {p.units === 0 ? (
        <div className="empty">Your bulk order is empty. <Link href="/catalogue">Browse the catalogue</Link> and set a size breakdown.</div>
      ) : (
        <>
          <section className="panel prox">
            <div className="spread">
              <h2 className="h3">{p.lines.length} style{p.lines.length > 1 ? "s" : ""} · {p.units} units</h2>
              <span className="pill info">{p.discountPct}% off tier</span>
            </div>
            <div className="scroll">
              <table className="tbl rtable">
                <thead><tr><th>Style</th><th>Sizes</th><th className="num">Units</th><th className="num">Unit ex GST</th><th className="num">Total</th><th /></tr></thead>
                <tbody>
                  {p.lines.map((l) => (
                    <tr key={l.productId}>
                      <td><b>{l.productName}</b>{l.belowMoq && <div className="small" style={{ color: "var(--warn)" }}>Below the {p.settings.moqPerStyle}-unit minimum</div>}</td>
                      <td className="mono small" data-label="Sizes">{l.sizes.filter((s) => s.quantity > 0).map((s) => `${s.size}×${s.quantity}`).join("  ")}</td>
                      <td className="num" data-label="Units">{l.units}</td>
                      <td className="num" data-label="Unit ex GST">{aud(l.unitPriceCents)}</td>
                      <td className="num" data-label="Line total">{aud(l.lineCents)}</td>
                      <td>
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          <Link className="link" href={`/catalogue/${l.slug}`}>Edit</Link>
                          <form action={removeProduct}><input type="hidden" name="productId" value={l.productId} /><button className="link">Remove</button></form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {next && <p className="note">{next.minUnits - p.units} more units unlocks {next.discountPct}% off the whole order.</p>}
          </section>

          <section className="split-even">
            <dl className="kv panel prox">
              <div><dt>At RRP</dt><dd className="mono dim"><s>{aud(retail)}</s></dd></div>
              <div><dt>Subtotal ex GST</dt><dd className="mono">{aud(p.subtotalCents)}</dd></div>
              <div><dt>GST 10%</dt><dd className="mono">{aud(p.gstCents)}</dd></div>
              <div><dt>Total</dt><dd className="mono strong">{aud(p.totalCents)}</dd></div>
            </dl>
            <ActionForm action={placeOrder} className="panel prox">
              {mode === "DEPOSIT" ? (
                <p><b>Pay {aud(split.dueNowCents)} now</b> ({p.settings.depositPct}% deposit). The {aud(split.balanceCents)} balance is due before dispatch.</p>
              ) : (
                <p><b>Pay {aud(split.dueNowCents)} now</b> in full.</p>
              )}
              <p className="dim small">Stock is held once your payment clears. Returns are only accepted after our team reviews a request.</p>
              {p.errors.length > 0 && <p className="note bad">{p.errors[0]}</p>}
              <div className="pinbar">
                <div className="total"><span className="small dim">Due now{mode === "DEPOSIT" ? ` · ${p.settings.depositPct}% deposit` : ""}</span><b>{aud(split.dueNowCents)}</b></div>
                <Submit pendingText="Opening checkout…" disabled={p.errors.length > 0}>Continue to payment</Submit>
              </div>
              <p className="small dim">Card, Apple Pay or Google Pay on the next screen.</p>
            </ActionForm>
          </section>
        </>
      )}
    </div>
  );
}
