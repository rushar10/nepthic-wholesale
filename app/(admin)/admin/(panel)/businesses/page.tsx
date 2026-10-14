import { businesses, db, desc } from "@/db";
import { formatAbn } from "@/core/abn";
import { dateShort } from "@/ui/format";
import { Status } from "@/ui/Status";
import { QuickAction } from "@/ui/ux/QuickAction";
import { guard } from "@/lib/admin/guard";
import { setBusinessStatus, setBusinessTerms } from "@/lib/admin/actions/wholesale";

export const metadata = { title: "Business accounts" };

export default async function Businesses() {
  const user = await guard("businesses");
  const admin = user.role === "ADMIN";
  const list = await db.query.businesses.findMany({ orderBy: desc(businesses.createdAt), with: { users: true, orders: true } });
  const pending = list.filter((b) => b.status === "PENDING");
  const rest = list.filter((b) => b.status !== "PENDING");

  const row = (b: (typeof list)[number]) => (
    <tr key={b.id}>
      <td><b>{b.tradingName}</b><div className="small dim">{b.legalName}</div></td>
      <td className="mono" data-label="ABN">{formatAbn(b.abn)}</td>
      <td className="small" data-label="Contact">{b.users[0]?.name}<div className="dim">{b.users[0]?.email} · {b.phone}</div></td>
      <td className="small" data-label="Where">{b.city} {b.state}</td>
      <td data-label="Applied">{dateShort(b.createdAt)}</td>
      <td data-label="Status"><Status value={b.status} /></td>
      <td className="num" data-label="Orders">{b.orders.length}</td>
      <td>
        {admin ? (
          <div className="row" style={{ flexWrap: "nowrap" }}>
            {b.status !== "APPROVED" && <QuickAction action={setBusinessStatus} fields={{ businessId: b.id, status: "APPROVED" }} done={`${b.tradingName} approved`} className="btn btn-sm btn-ok">Approve</QuickAction>}
            {b.status === "PENDING" && <QuickAction action={setBusinessStatus} fields={{ businessId: b.id, status: "REJECTED" }} done="Application declined" className="btn btn-sm btn-bad">Reject</QuickAction>}
            {b.status === "APPROVED" && (
              <form action={setBusinessTerms} className="row" style={{ flexWrap: "nowrap" }}>
                <input type="hidden" name="businessId" value={b.id} />
                <select name="paymentMode" defaultValue={b.paymentModeOverride ?? ""} aria-label={`Payment terms for ${b.tradingName}`} style={{ width: "auto" }}>
                  <option value="">Default terms</option><option value="FULL">Always full</option><option value="DEPOSIT">Always deposit</option>
                </select>
                <button className="btn btn-sm">Save</button>
              </form>
            )}
          </div>
        ) : <span className="small dim">Admin decides</span>}
      </td>
    </tr>
  );

  return (
    <>
      <div><p className="eyebrow">Wholesale</p><h1 className="page" style={{ marginTop: 6 }}>Business accounts</h1>
        <p className="dim small" style={{ marginTop: 6 }}>Check the ABN on <a href="https://abr.business.gov.au" target="_blank" rel="noopener">ABN Lookup</a> before approving. Approved accounts see trade prices and can order.</p></div>
      {[["Waiting for review", pending], ["All accounts", rest]].map(([title, rows]) => (rows as typeof list).length > 0 && (
        <section key={title as string} className="panel prox">
          <h2 className="h3">{title as string}</h2>
          <div className="scroll"><table className="tbl rtable">
            <thead><tr><th>Business</th><th>ABN</th><th>Contact</th><th>Location</th><th>Applied</th><th>Status</th><th className="num">Orders</th><th /></tr></thead>
            <tbody>{(rows as typeof list).map(row)}</tbody>
          </table></div>
        </section>
      ))}
      {list.length === 0 && <div className="empty">No business accounts yet.</div>}
    </>
  );
}
