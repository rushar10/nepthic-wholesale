import { getSettings, getTiers } from "@/core/settings";
import { tradeUnitCents } from "@/core/pricing";
import { aud } from "@/ui/format";
import { ActionForm, Submit } from "@/ui/Forms";
import { guard } from "@/lib/admin/guard";
import { saveTiers } from "@/lib/admin/actions/wholesale";

export const metadata = { title: "Pricing tiers" };

export default async function Pricing() {
  const user = await guard("pricing");
  const admin = user.role === "ADMIN";
  const [tiers, s] = await Promise.all([getTiers(), getSettings()]);
  const rows = [...tiers, { id: "new", minUnits: 0, maxUnits: null, discountPct: 0 }];

  return (
    <>
      <div><p className="eyebrow">Wholesale</p><h1 className="page" style={{ marginTop: 6 }}>Volume pricing</h1>
        <p className="dim small" style={{ marginTop: 6 }}>The tier is set by total units in an order, across all styles. Trade price = RRP less the tier discount, ex GST. Sent quotes keep their own price.</p></div>
      <ActionForm action={saveTiers} className="panel prox">
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Tier</th><th>From units</th><th>To units</th><th>Discount off RRP</th><th>e.g. $129 hoodie</th></tr></thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.id}>
                <td>{t.id === "new" ? <span className="dim">Add</span> : i + 1}</td>
                <td><input type="number" name={`min_${i}`} min={0} defaultValue={t.minUnits || ""} disabled={!admin} aria-label={`Tier ${i + 1} from`} /></td>
                <td><input type="number" name={`max_${i}`} min={0} defaultValue={t.maxUnits ?? ""} placeholder="and up" disabled={!admin} aria-label={`Tier ${i + 1} to`} /></td>
                <td><input type="number" name={`off_${i}`} min={0} max={90} defaultValue={t.discountPct || ""} disabled={!admin} aria-label={`Tier ${i + 1} discount`} /> %</td>
                <td className="mono">{t.id === "new" ? "" : aud(tradeUnitCents(12900, t.discountPct))}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <label className="f" style={{ maxWidth: 240 }}>Minimum units per style<input type="number" name="moq" min={1} defaultValue={s.moqPerStyle} disabled={!admin} /></label>
        <p className="dim small">Clear a row&apos;s numbers to remove it. Leave &ldquo;to&rdquo; empty on the last tier.</p>
        {admin ? <Submit pendingText="Saving…">Save pricing</Submit> : <p className="small dim">Only admins can change pricing.</p>}
      </ActionForm>
    </>
  );
}
