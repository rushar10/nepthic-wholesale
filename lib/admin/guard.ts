import { redirect } from "next/navigation";
import { STAFF_ROLES, requireUser } from "@/core/auth";
import type { Role } from "@/db";

/* Role-based access for the Wholesale admin.
   ADMIN: everything. STAFF: day-to-day work (quotes, orders, products); no approvals of
   accounts or returns, payments, pricing or settings. Trade buyers never get in. */

export type Section = "overview" | "approvals" | "quotes" | "orders" | "businesses" | "pricing" | "returns" | "products" | "customers" | "payments" | "settings";

const ACCESS: Record<Section, Role[]> = {
  overview: ["STAFF", "ADMIN"],
  approvals: ["STAFF", "ADMIN"],
  quotes: ["STAFF", "ADMIN"],
  orders: ["STAFF", "ADMIN"],
  businesses: ["STAFF", "ADMIN"],
  pricing: ["STAFF", "ADMIN"],
  returns: ["STAFF", "ADMIN"],
  products: ["STAFF", "ADMIN"],
  customers: ["STAFF", "ADMIN"],
  payments: ["ADMIN"],
  settings: ["ADMIN"],
};

export const canSee = (role: Role, s: Section) => ACCESS[s].includes(role);

/** Page guard: signed in as Wholesale staff, and allowed into this section. */
export async function guard(section: Section) {
  const user = await requireUser(STAFF_ROLES, "/admin/login");
  if (!canSee(user.role, section)) redirect("/admin/forbidden");
  return user;
}

/** Action guard for decisions only admins may make (approvals, money, settings). */
export async function requireAdmin() {
  const user = await requireUser(STAFF_ROLES, "/admin/login");
  if (user.role !== "ADMIN") throw new Error("Only an admin can do that.");
  return user;
}

export async function requireStaff() {
  return requireUser(STAFF_ROLES, "/admin/login");
}
