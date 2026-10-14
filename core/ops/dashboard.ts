import { db, sql } from "@/db";
import { pendingCounts } from "./counts";

/* Data for the Wholesale admin overview and the read-only summary API. Everything comes from
   this site's own database. Money is in cents, inc GST, net of refunds. Days, weeks and
   months use Brisbane time. */

const TZ = sql.raw("'Australia/Brisbane'");
type Row = Record<string, unknown>;
const rows = async <T extends Row>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];
const n = (v: unknown) => Number(v ?? 0);

/** Year-month keys for the last `count` months, ending with the current Brisbane month. */
export function monthKeys(count = 12, now = new Date()) {
  const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit" }).format(now);
  let [y, m] = ym.split("-").map(Number);
  const out: { key: string; label: string; long: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1, 15));
    out.unshift({ key: `${y}-${String(m).padStart(2, "0")}`, label: d.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" }), long: d.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }) });
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

/** Net wholesale revenue (deposits, balances and full payments, less refunds) per month, last 12 months. */
export async function monthlyRevenue() {
  const r = await rows<{ m: string; v: string }>(sql`
    select to_char(date_trunc('month', paid_at at time zone ${TZ}), 'YYYY-MM') as m, sum(amount_cents) as v
    from payments
    where status = 'SUCCEEDED' and paid_at >= ((date_trunc('month', now() at time zone ${TZ}) - interval '11 months') at time zone ${TZ})
    group by 1`);
  return monthKeys().map((k) => ({ ...k, value: n(r.find((x) => x.m === k.key)?.v) }));
}

/** Net revenue per stockist over the last `days` days: the top three, then everyone else. */
export async function revenueByStockist(days = 30) {
  const r = await rows<{ name: string; v: string }>(sql`
    select coalesce(b.trading_name, 'No business') as name, sum(p.amount_cents) as v
    from payments p join orders o on o.id = p.order_id left join businesses b on b.id = o.business_id
    where p.status = 'SUCCEEDED' and p.paid_at >= now() - make_interval(days => ${days})
    group by 1 order by v desc`);
  const top = r.slice(0, 3).map((x) => ({ label: x.name, value: Math.max(0, n(x.v)) }));
  const rest = r.slice(3).reduce((a, x) => a + Math.max(0, n(x.v)), 0);
  return rest > 0 ? [...top, { label: "Other stockists", value: rest }] : top;
}

/** Bulk orders placed and units ordered: last 7 days vs the 7 before. */
export async function week() {
  const [r] = await rows<{ o_now: string; o_prev: string; u_now: string; u_prev: string }>(sql`
    select
      (select count(*) from orders where status <> 'CANCELLED' and created_at >= now() - interval '7 days') as o_now,
      (select count(*) from orders where status <> 'CANCELLED' and created_at >= now() - interval '14 days' and created_at < now() - interval '7 days') as o_prev,
      (select coalesce(sum(i.quantity),0) from order_items i join orders o on o.id = i.order_id where o.status <> 'CANCELLED' and o.created_at >= now() - interval '7 days') as u_now,
      (select coalesce(sum(i.quantity),0) from order_items i join orders o on o.id = i.order_id where o.status <> 'CANCELLED' and o.created_at >= now() - interval '14 days' and o.created_at < now() - interval '7 days') as u_prev`);
  return { orders: { now: n(r.o_now), prev: n(r.o_prev) }, units: { now: n(r.u_now), prev: n(r.u_prev) } };
}

/** Balances still owed on deposit orders: total, count, overdue, and the next one due. */
export async function balancesDue() {
  const [r] = await rows<{ total: string; cnt: string; overdue: string }>(sql`
    select coalesce(sum(total_cents - paid_cents), 0) as total, count(*) as cnt,
           count(*) filter (where balance_due_at < now()) as overdue
    from orders where status in ('DEPOSIT_PAID', 'BALANCE_REQUESTED') and total_cents > paid_cents`);
  const [next] = await rows<{ id: string; number: number; name: string | null; owed: string; due: Date | null }>(sql`
    select o.id, o.number, b.trading_name as name, (o.total_cents - o.paid_cents) as owed, o.balance_due_at as due
    from orders o left join businesses b on b.id = o.business_id
    where o.status in ('DEPOSIT_PAID', 'BALANCE_REQUESTED') and o.total_cents > o.paid_cents
    order by o.balance_due_at asc nulls last limit 1`);
  return {
    total: n(r?.total), count: n(r?.cnt), overdue: n(r?.overdue),
    next: next ? { id: next.id, number: n(next.number), name: next.name ?? "Customer", owed: n(next.owed), due: next.due ? new Date(next.due) : null } : null,
  };
}

export type Activity = { id: string; kind: "order" | "quote" | "return"; who: string; detail: string; amount: number | null; at: Date };

/** Newest bulk orders, quote requests and return requests. */
export async function recentActivity(limit = 7) {
  const r = await rows<{ id: string; kind: Activity["kind"]; who: string; detail: string; amount: string | null; at: Date }>(sql`
    select * from (
      select o.id, 'order' as kind, coalesce(b.trading_name, u.name) as who,
             'Bulk order #' || o.number || ' · ' || coalesce((select sum(quantity) from order_items where order_id = o.id), 0) || ' units' as detail,
             o.total_cents::text as amount, o.created_at as at
      from orders o join users u on u.id = o.user_id left join businesses b on b.id = o.business_id where o.status <> 'CANCELLED'
      union all
      select q.id, 'quote', b.trading_name, case when q.type = 'ENQUIRY' then 'Enquiry Q-' else 'Quote request Q-' end || q.number, q.amount_cents::text, q.created_at
      from quotes q join businesses b on b.id = q.business_id
      union all
      select r.id, 'return', coalesce(b.trading_name, u.name), 'Return R-' || r.number || ' · ' || r.units || ' units', null, r.created_at
      from return_requests r join users u on u.id = r.user_id join orders o on o.id = r.order_id left join businesses b on b.id = o.business_id
    ) a order by a.at desc limit ${limit}`);
  return r.map((x): Activity => ({ id: x.id, kind: x.kind, who: x.who, detail: x.detail, amount: x.amount == null ? null : n(x.amount), at: new Date(x.at) }));
}

/** Today's takings by hour (Brisbane), up to now, and yesterday's total to the same time. */
export async function salesToday() {
  const r = await rows<{ h: number; v: string }>(sql`
    select extract(hour from paid_at at time zone ${TZ})::int as h, sum(amount_cents) as v
    from payments where status = 'SUCCEEDED' and amount_cents > 0
      and (paid_at at time zone ${TZ})::date = (now() at time zone ${TZ})::date
    group by 1 order by 1`);
  const [y] = await rows<{ v: string }>(sql`
    select coalesce(sum(amount_cents), 0) as v from payments
    where status = 'SUCCEEDED' and amount_cents > 0
      and (paid_at at time zone ${TZ})::date = (now() at time zone ${TZ})::date - 1
      and (paid_at at time zone ${TZ})::time <= (now() at time zone ${TZ})::time`);
  const hourNow = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", hour: "numeric", hour12: false }).format(new Date())) % 24;
  const hours = Array.from({ length: hourNow + 1 }, (_, h) => n(r.find((x) => n(x.h) === h)?.v));
  return { hours, total: hours.reduce((a, b) => a + b, 0), yesterday: n(y?.v) };
}

export const approvals = pendingCounts;
export const changePct = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : now > 0 ? null : 0);
