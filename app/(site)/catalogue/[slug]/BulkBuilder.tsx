"use client";
import { useState } from "react";
import { ActionForm, Submit } from "@/ui/Forms";
import { BottomSheet } from "@/ui/Mobile";
import { aud } from "@/ui/format";
import { nextTier, tierFor, tradeUnitCents, type Tier } from "@/core/pricing";
import { setLine } from "@/app/actions/order";

type Size = { id: string; size: string; stock: number };

/* Size-by-quantity grid with +/− steppers and a running total pinned to the bottom of
   the screen on phones. Totals are live in the browser; the server re-prices on submit. */
export function BulkBuilder({ productId, rrpCents, sizes, initial, otherUnits, tiers, moq }: {
  productId: string; rrpCents: number; sizes: Size[]; initial: Record<string, number>;
  otherUnits: number; tiers: Tier[]; moq: number;
}) {
  const hasExisting = Object.values(initial).some((q) => q > 0);
  const [qty, setQty] = useState<Record<string, number>>(() =>
    hasExisting ? initial : Object.fromEntries(sizes.map((s, i) => [s.id, sizes.length === 1 ? moq * 2 : [6, 12, 12, 6, 0][i] ?? 0])),
  );
  const [presets, setPresets] = useState(false);
  const units = Object.values(qty).reduce((a, b) => a + b, 0);
  const all = units + otherUnits;
  const tier = tierFor(all, tiers);
  const unit = tradeUnitCents(rrpCents, tier?.discountPct ?? 0);
  const next = nextTier(all, tiers);
  const under = units > 0 && units < moq;
  const over = sizes.find((s) => (qty[s.id] ?? 0) > s.stock);
  const set = (id: string, n: number) => setQty((q) => ({ ...q, [id]: Math.max(0, n) }));

  // Quick fills, spread like a typical size curve (S 15%, M 30%, L 30%, XL 17%, XXL 8%).
  const curve = (total: number) => {
    const w = sizes.length === 5 ? [0.15, 0.3, 0.3, 0.17, 0.08] : sizes.map(() => 1 / sizes.length);
    const base = sizes.map((_, i) => Math.floor(total * w[i]));
    base[Math.min(2, sizes.length - 1)] += total - base.reduce((a, b) => a + b, 0);
    setQty(Object.fromEntries(sizes.map((s, i) => [s.id, base[i]])));
    setPresets(false);
  };

  return (
    <ActionForm action={setLine} className="stack-sm">
      <input type="hidden" name="productId" value={productId} />
      <div className="spread">
        <div><p className="eyebrow">Size breakdown</p><p className="dim small" style={{ marginTop: 4 }}>Minimum {moq} for this style. Mix sizes freely.</p></div>
        {sizes.length > 1 && <button type="button" className="btn btn-sm prox" onClick={() => setPresets(true)}>Quick fill</button>}
      </div>

      <div className="size-grid">
        {sizes.map((s) => {
          const n = qty[s.id] ?? 0;
          return (
            <div className="size-row" key={s.id}>
              <b>{s.size}</b>
              <span className="small dim">{s.stock} in stock{n > s.stock && <span style={{ color: "var(--bad)" }}> · too many</span>}</span>
              <span className="stepper">
                <button type="button" onClick={() => set(s.id, n - (n >= 12 ? 6 : 1))} aria-label={`Fewer ${s.size}`}>−</button>
                <input type="number" inputMode="numeric" pattern="[0-9]*" min={0} name={`qty_${s.id}`} value={n}
                  aria-label={`Quantity in size ${s.size}`} onChange={(e) => set(s.id, parseInt(e.target.value, 10) || 0)} />
                <button type="button" onClick={() => set(s.id, n + (n >= 6 ? 6 : 1))} aria-label={`More ${s.size}`}>+</button>
              </span>
            </div>
          );
        })}
      </div>
      <p className="small dim">+/− moves in 6s once a size has 6 or more (a common carton split).</p>

      {under && <p className="note warn">Add {moq - units} more to reach the {moq}-unit minimum.</p>}
      {over && <p className="note bad">Only {over.stock} in size {over.size}. Request a quote for larger runs.</p>}
      {!under && next && units > 0 && <p className="note">{next.minUnits - all} more units across your order unlocks {next.discountPct}% off everything.</p>}
      {otherUnits > 0 && <p className="small dim">The tier counts the {otherUnits} units already in your order.</p>}

      <div className="pinbar">
        <div className="total">
          <span className="small dim">{units} units · {tier ? `${tier.discountPct}% off` : "below minimum"} · {aud(unit)} ea</span>
          <b>{aud(unit * units)} <span className="small dim" style={{ fontFamily: "var(--f-body)", fontWeight: 400 }}>ex GST</span></b>
        </div>
        <Submit pendingText="Saving…" disabled={!!over || under}>{hasExisting ? (units === 0 ? "Remove" : "Update order") : "Add to order"}</Submit>
      </div>

      <BottomSheet open={presets} onClose={() => setPresets(false)} title="Quick fill sizes">
        <p className="dim small">Spreads units across sizes on a typical streetwear curve. Adjust after.</p>
        <div className="row">
          {[moq, 48, 72, 120].map((t) => <button type="button" key={t} className="btn prox" onClick={() => curve(t)}>{t} units</button>)}
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => { setQty(Object.fromEntries(sizes.map((s) => [s.id, 0]))); setPresets(false); }}>Clear all</button>
      </BottomSheet>
    </ActionForm>
  );
}
