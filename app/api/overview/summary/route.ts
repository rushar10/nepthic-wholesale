import { overviewAuthorised } from "@/core/overview-api";
import { balancesDue, monthlyRevenue, recentActivity, salesToday, week } from "@/lib/admin/dashboard";
import { pendingCounts } from "@/lib/admin/counts";
import { and, catalogueImports, db, desc, eq, payments, sql } from "@/db";

export const dynamic = "force-dynamic";

/** GET /api/overview/summary — read-only numbers for the Nepthic Overview dashboard.
    Activity names are trading names (businesses), never buyers' personal details. */
export async function GET(req: Request) {
  const auth = overviewAuthorised(req);
  if (auth === "off") return new Response("Not found", { status: 404 });
  if (auth === "denied") return new Response("Unauthorised", { status: 401, headers: { "www-authenticate": "Bearer" } });

  const [months, wk, bal, activity, today, pending, [last30], lastImport] = await Promise.all([
    monthlyRevenue(), week(), balancesDue(), recentActivity(8), salesToday(), pendingCounts(),
    db.select({ cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` }).from(payments)
      .where(sql`${payments.status} = 'SUCCEEDED' and ${payments.paidAt} >= now() - interval '30 days'`),
    db.query.catalogueImports.findFirst({ orderBy: desc(catalogueImports.startedAt) }),
  ]);
  const lastGood = lastImport?.status === "SUCCEEDED" ? lastImport
    : await db.query.catalogueImports.findFirst({ where: and(eq(catalogueImports.status, "SUCCEEDED")), orderBy: desc(catalogueImports.startedAt) });

  return Response.json({
    site: "wholesale",
    name: "Nepthic Wholesale",
    generatedAt: new Date().toISOString(),
    currency: "AUD",
    revenue: { monthly: months.map((m) => ({ month: m.key, cents: m.value })), last30Cents: last30.cents },
    orders: wk.orders,
    units: wk.units,
    balances: { totalCents: bal.total, count: bal.count, overdue: bal.overdue },
    pending,
    today,
    catalogue: lastImport && { status: lastImport.status, at: (lastImport.finishedAt ?? lastImport.startedAt).toISOString(), lastGoodAt: lastGood ? (lastGood.finishedAt ?? lastGood.startedAt).toISOString() : null },
    activity: activity.map((a) => ({ at: a.at.toISOString(), who: a.who, detail: a.detail, cents: a.amount, kind: a.kind })),
  }, { headers: { "cache-control": "no-store" } });
}
