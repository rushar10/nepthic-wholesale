import { and, db, desc, eq, ilike, inArray, or, orders, sql, users } from "@/db";
import { aud, dateShort } from "@/ui/format";
import { guard } from "@/lib/admin/guard";

export const metadata = { title: "Buyers" };

/* Everyone who signs in to buy on Wholesale. Accounts here are Wholesale-only:
   they don't exist on Clothing or Events, and those sites' customers aren't listed. */
export default async function Buyers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await guard("customers");
  const { q } = await searchParams;
  const term = q?.trim();
  const list = await db.query.users.findMany({
    where: and(eq(users.role, "BUSINESS"), term ? or(ilike(users.name, `%${term}%`), ilike(users.email, `%${term}%`)) : undefined),
    orderBy: desc(users.createdAt),
    limit: 200,
    with: { business: true },
    columns: { passwordHash: false },
  });
  const spend = list.length
    ? await db.select({
        userId: orders.userId,
        n: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${orders.paidCents} - ${orders.refundedCents}),0)::int`,
      }).from(orders).where(and(inArray(orders.userId, list.map((u) => u.id)), sql`${orders.status} <> 'CANCELLED'`)).groupBy(orders.userId)
    : [];
  const by = new Map(spend.map((s) => [s.userId, s]));
  const status = (s?: string) => s === "APPROVED" ? <span className="pill ok">Approved</span> : s === "REJECTED" ? <span className="pill bad">Declined</span> : s === "PENDING" ? <span className="pill warn">Awaiting approval</span> : <span className="pill">No business</span>;

  return (
    <>
      <div className="spread">
        <div><p className="eyebrow">People</p><h1 className="page" style={{ marginTop: 6 }}>Buyers</h1>
          <p className="dim small" style={{ marginTop: 6 }}>Wholesale logins. Approve or decline the businesses behind them on the <a href="/admin/businesses">Businesses</a> page.</p></div>
        <form className="row" role="search"><input type="search" name="q" defaultValue={q} placeholder="Name or email" aria-label="Search buyers" style={{ width: 240 }} /><button className="btn btn-sm">Search</button></form>
      </div>
      <section className="panel prox">
        <div className="scroll"><table className="tbl rtable">
          <thead><tr><th>Name</th><th>Email</th><th>Account</th><th>Joined</th><th className="num">Orders</th><th className="num">Paid</th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b>{u.business && <div className="small dim">{u.business.tradingName}</div>}</td>
                <td className="small" data-label="Email">{u.email}</td>
                <td data-label="Account">{status(u.business?.status)}</td>
                <td data-label="Joined">{dateShort(u.createdAt)}</td>
                <td className="num" data-label="Orders">{by.get(u.id)?.n ?? 0}</td>
                <td className="num" data-label="Paid">{aud(by.get(u.id)?.cents ?? 0)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="dim">No buyers match.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
