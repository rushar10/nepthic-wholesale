import Link from "next/link";
import { PullToRefresh } from "@/ui/ux/PullToRefresh";
import { aud0, dateShort } from "@/ui/format";
import { guard } from "@/lib/admin/guard";
import { approvals, balancesDue, changePct, monthlyRevenue, recentActivity, revenueByStockist, salesToday, week } from "@/lib/admin/dashboard";
import { Card, Change, StatCard, accentVars } from "@/components/admin/dash/Card";
import { BarChart } from "@/components/admin/dash/BarChart";
import { DonutChart } from "@/components/admin/dash/DonutChart";
import { ActivityList } from "@/components/admin/dash/ActivityList";
import { Sparkline } from "@/components/admin/dash/Sparkline";

export const metadata = { title: "Overview" };

const WS = "var(--ws)";
const SEGMENT_COLOURS = ["#2DD4BF", "#8B5CF6", "#99F6E4", "#6E6680"];
const ACT = {
  order: { icon: "box", color: WS, label: "Bulk order" },
  quote: { icon: "chat", color: "var(--brand)", label: "Quote" },
  return: { icon: "undo", color: "var(--warn)", label: "Return" },
} as const;

export default async function Overview() {
  await guard("overview");
  const [months, byStockist, wk, bal, activity, today, appr] = await Promise.all([
    monthlyRevenue(), revenueByStockist(30), week(), balancesDue(), recentActivity(), salesToday(), approvals(),
  ]);
  const bars = months.map((m) => ({ key: m.key, label: m.label, long: m.long, value: m.value }));
  const thisMonth = bars[bars.length - 1].value, lastMonth = bars[bars.length - 2].value;
  const segments = byStockist.map((e, i) => ({ key: e.label, label: e.label, color: SEGMENT_COLOURS[i] ?? "#6E6680", value: e.value }));
  const queues = [
    { label: "Quote requests", n: appr.quotes, href: "/admin/quotes" },
    { label: "Returns", n: appr.returns, href: "/admin/returns" },
    { label: "Trade accounts", n: appr.businesses, href: "/admin/businesses" },
  ];

  return (
    <PullToRefresh>
      <div className="dash-head"><h1>Wholesale Dashboard</h1></div>
      <div className="dash-grid">
        <div className="dash-main">
          <Card className="o-flow" title="Revenue Flow" id="t-flow" accent={WS}
            action={<Link className="more" href="/admin/payments">View All <span aria-hidden="true">›</span></Link>}>
            <div className="stat-foot" style={{ marginTop: -6 }}>
              <span className="big" style={{ fontSize: "1.6rem", color: "var(--fg)" }}>{aud0(thisMonth)}</span>
              <Change pct={changePct(thisMonth, lastMonth)} />
              <span>wholesale revenue this month vs last</span>
            </div>
            <BarChart data={bars} color={WS} label="Monthly net wholesale revenue, last 12 months. Use tab to read each month." />
          </Card>
          <div className="dash-row">
            <Card className="o-donut" title="Revenue by Stockist" id="t-st" action={<span className="small dim">Last 30 days</span>}>
              {segments.length ? <DonutChart segments={segments} /> : <p className="muted">No wholesale payments in the last 30 days.</p>}
            </Card>
            <div className="dash-stack o-stats">
              <StatCard label="Bulk orders" icon="box" accent={WS} href="/admin/orders" value={wk.orders.now.toLocaleString("en-AU")}
                pct={changePct(wk.orders.now, wk.orders.prev)} note="orders placed · 7 days" />
              <StatCard label="Units ordered" icon="shirt" accent={WS} href="/admin/orders" value={wk.units.now.toLocaleString("en-AU")}
                pct={changePct(wk.units.now, wk.units.prev)} note="garments · 7 days" />
            </div>
          </div>
        </div>

        <div className="dash-side">
          <section className="stack-card o-next" aria-labelledby="t-bal">
            <div className="ev-top" data-glow style={accentVars("brand")}>
              <div className="row1">
                <div>
                  <span className="kicker" id="t-bal">Balances due · {bal.count} order{bal.count === 1 ? "" : "s"}{bal.overdue ? ` · ${bal.overdue} overdue` : ""}</span>
                  <h3>{aud0(bal.total)}</h3>
                </div>
              </div>
              {bal.next ? (
                <>
                  <span className="meta">Next: #{bal.next.number} · {bal.next.name} · {aud0(bal.next.owed)}{bal.next.due ? ` due ${dateShort(bal.next.due)}` : ""}</span>
                  <Link href="/admin/orders" style={{ color: "#fff", fontWeight: 700, fontSize: ".88rem" }}>Open orders <span aria-hidden="true">›</span></Link>
                </>
              ) : <span className="meta">No deposit orders are waiting on a balance.</span>}
            </div>
          </section>

          <Card className="o-act" title="Recent Activity" id="t-act" action={<Link className="more" href="/admin/orders">View All <span aria-hidden="true">›</span></Link>}>
            <ActivityList items={activity.map((a) => ({ ...a, ...ACT[a.kind] }))} />
          </Card>

          <div className="dash-pair">
            <Card className="o-appr" title="Pending Approvals" id="t-appr">
              <ul className="appr">
                {queues.map((q) => <li key={q.label}><span>{q.label}</span><b className={q.n ? "has" : undefined}>{q.n}</b></li>)}
              </ul>
              <Link className="btn-pill" href="/admin/approvals">Review{appr.total ? ` ${appr.total}` : ""}</Link>
            </Card>
            <Card className="o-live" title="Live Sales" id="t-live" accent={WS}>
              <div>
                <span className="big" style={{ fontSize: "1.5rem" }}>{aud0(today.total)}</span>
                <div className="small muted">today{today.yesterday ? ` · ${aud0(today.yesterday)} by now yesterday` : ""}</div>
              </div>
              <Sparkline values={today.hours} label={`Wholesale takings today by hour: ${aud0(today.total)} so far`} />
            </Card>
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}
