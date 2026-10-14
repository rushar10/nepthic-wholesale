import { db, desc, inArray, users } from "@/db";
import { getSettings } from "@/core/settings";
import { env } from "@/core/env";
import { ActionForm, Submit } from "@/ui/Forms";
import { guard } from "@/lib/admin/guard";
import { addStaff, saveSettings, setRole } from "@/lib/admin/actions/settings";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const me = await guard("settings");
  const s = await getSettings();
  const staff = await db.query.users.findMany({ where: inArray(users.role, ["ADMIN", "STAFF"]), orderBy: desc(users.createdAt), columns: { passwordHash: false } });

  return (
    <>
      <div><p className="eyebrow">Settings</p><h1 className="page" style={{ marginTop: 6 }}>Wholesale settings</h1></div>

      <ActionForm action={saveSettings} className="stack">
        <section className="panel prox">
          <h2 className="h3">Wholesale payment terms</h2>
          <p className="dim small">The business model isn&apos;t final, so this is a switch. It sets the default for new orders and quotes. Individual businesses, quotes and unpaid orders can override it.</p>
          <div className="seg" role="radiogroup" aria-label="Default payment terms">
            <label><input type="radio" name="paymentMode" value="FULL" defaultChecked={s.paymentMode === "FULL"} /> Full payment</label>
            <label><input type="radio" name="paymentMode" value="DEPOSIT" defaultChecked={s.paymentMode === "DEPOSIT"} /> Deposit + balance</label>
          </div>
          <div className="form-grid">
            <label className="f">Deposit (%)<input type="number" name="depositPct" min={5} max={90} defaultValue={s.depositPct} /></label>
            <label className="f">Balance due (days after request)<input type="number" name="balanceDueDays" min={0} defaultValue={s.balanceDueDays} /></label>
            <label className="f">Quotes valid for (days)<input type="number" name="quoteValidDays" min={1} defaultValue={s.quoteValidDays} /></label>
          </div>
        </section>
        <section className="panel prox">
          <h2 className="h3">Minimum order</h2>
          <div className="form-grid">
            <label className="f">Minimum units per style (MOQ)<input type="number" name="moqPerStyle" min={1} max={1000} defaultValue={s.moqPerStyle} /></label>
          </div>
          <p className="dim small">Quantity price breaks are set on the <a href="/admin/pricing">Pricing</a> page.</p>
        </section>
        <section className="panel prox">
          <h2 className="h3">Proximity glow</h2>
          <p className="dim small">Cards and buttons light up as the cursor gets close. Off automatically for touch screens and anyone with reduced motion turned on. Admin runs it at about half strength.</p>
          <div className="form-grid">
            <label className="f">Radius (px)<input type="number" name="proximityRadius" min={20} max={400} defaultValue={s.proximityRadius} /></label>
            <label className="f">Intensity (0–1)<input type="number" name="proximityIntensity" min={0} max={1} step={0.05} defaultValue={s.proximityIntensity} /></label>
          </div>
          <label className="row small"><input type="checkbox" name="proximityEnabled" defaultChecked={s.proximityEnabled} /> Effect on</label>
        </section>
        <Submit pendingText="Saving…">Save settings</Submit>
      </ActionForm>

      <section className="panel prox">
        <h2 className="h3">Staff &amp; roles</h2>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td><td className="small">{u.email}</td>
                <td>{u.id === me.id ? <span className="pill info">{u.role.toLowerCase()} (you)</span> : (
                  <form action={setRole} className="row" style={{ flexWrap: "nowrap" }}>
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`} style={{ width: "auto" }}>
                      <option value="ADMIN">Admin</option><option value="STAFF">Staff</option><option value="BUSINESS">Remove access</option>
                    </select>
                    <button className="btn btn-sm">Save</button>
                  </form>
                )}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table></div>
        <ActionForm action={addStaff} className="stack-sm">
          <div className="form-grid">
            <label className="f">Name<input type="text" name="name" required /></label>
            <label className="f">Email<input type="email" name="email" required /></label>
            <label className="f">Role<select name="role" defaultValue="STAFF"><option value="STAFF">Staff</option><option value="ADMIN">Admin</option></select></label>
            <label className="f">Temporary password<input type="text" name="password" minLength={10} required autoComplete="off" /></label>
          </div>
          <Submit className="btn prox" pendingText="Adding…">Add staff member</Submit>
        </ActionForm>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Role</th><th>Can see</th><th>Can approve</th></tr></thead>
          <tbody>
            <tr><td><b>Admin</b></td><td>Everything</td><td>Trade accounts, returns, pricing, payment terms, settings</td></tr>
            <tr><td><b>Staff</b></td><td>Overview, quotes, orders, businesses, products, buyers</td><td>Send quotes, request balances, ship orders, edit stock</td></tr>
          </tbody>
        </table></div>
      </section>

      <section className="panel prox">
        <h2 className="h3">Connections</h2>
        <dl className="kv">
          <div><dt>Payments</dt><dd>{env.paymentsMode === "stripe" ? "Stripe (live keys from env)" : "Mock mode — nothing is charged"}</dd></div>
          <div><dt>Email</dt><dd>{env.resendApiKey ? `Resend · from ${env.emailFrom}` : "Logged only (no RESEND_API_KEY)"}</dd></div>
          <div><dt>Team alerts</dt><dd>{env.adminNotifyEmail || "Not set (ADMIN_NOTIFY_EMAIL)"}</dd></div>
        </dl>
      </section>
    </>
  );
}
