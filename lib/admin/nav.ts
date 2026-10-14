import { STAFF_ROLES, requireUser } from "@/core/auth";
import { canSee, type Section } from "./guard";
import { pendingCounts } from "./counts";

export type AdminNavItem = { href: string; label: string; badge?: number; section: Section; icon: string };
export type RailItem = { href: string; label: string; icon: string; badge?: number; match?: string[] };

const ALL = (p: Awaited<ReturnType<typeof pendingCounts>>): AdminNavItem[] => [
  { section: "overview", href: "/admin", label: "Overview", icon: "chart" },
  { section: "approvals", href: "/admin/approvals", label: "Approvals", icon: "inbox", badge: p.total },
  { section: "quotes", href: "/admin/quotes", label: "Quotes", icon: "chat", badge: p.quotes },
  { section: "orders", href: "/admin/orders", label: "Bulk orders", icon: "box" },
  { section: "products", href: "/admin/products", label: "Products", icon: "shirt" },
  { section: "businesses", href: "/admin/businesses", label: "Trade accounts", icon: "users", badge: p.businesses },
  { section: "customers", href: "/admin/customers", label: "Buyers", icon: "user" },
  { section: "returns", href: "/admin/returns", label: "Returns", icon: "undo", badge: p.returns },
  { section: "pricing", href: "/admin/pricing", label: "Pricing tiers", icon: "grid" },
  { section: "payments", href: "/admin/payments", label: "Payments", icon: "card" },
  { section: "settings", href: "/admin/settings", label: "Settings", icon: "cog" },
];

/** Every section the role can open (the phone "More" menu lists these). */
export async function adminNav() {
  const user = await requireUser(STAFF_ROLES, "/admin/login");
  const p = await pendingCounts();
  return { user, p, items: ALL(p).filter((i) => canSee(user.role, i.section)) };
}

/** The floating icon rail and the phone bottom bar. Wholesale only. */
export async function railNav() {
  const { user, p, items } = await adminNav();
  const pick = (s: Section) => items.find((i) => i.section === s);
  const toRail = (i?: AdminNavItem): RailItem | null => (i ? { href: i.href, label: i.label, icon: i.icon, badge: i.badge } : null);
  const main = (["overview", "quotes", "orders", "products", "businesses", "pricing", "payments"] as Section[]).map((s) => toRail(pick(s))).filter(Boolean) as RailItem[];
  const admin = (["approvals", "settings"] as Section[]).map((s) => toRail(pick(s))).filter(Boolean) as RailItem[];
  const bottom = [
    { href: "/admin", label: "Overview", icon: "chart" },
    { href: "/admin/approvals", label: "Approvals", icon: "inbox", badge: p.total },
    { href: "/admin/quotes", label: "Quotes", icon: "chat", badge: p.quotes },
    { href: "/admin/orders", label: "Orders", icon: "box" },
    { href: "/admin/more", label: "More", icon: "menu" },
  ];
  return { user, p, main, admin, bottom };
}
