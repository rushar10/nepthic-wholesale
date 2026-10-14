import { redirect } from "next/navigation";
import { requireUser, type SessionUser } from "@/core/auth";

type BusinessUser = SessionUser & { business: NonNullable<SessionUser["business"]> };

/** A signed-in business buyer (approved or not). */
export async function requireBusiness(): Promise<BusinessUser> {
  const u = await requireUser(["BUSINESS"], "/login");
  if (!u.business) redirect("/register");
  return u as BusinessUser;
}

/** A buyer whose trade account has been approved. */
export async function requireApprovedBusiness(): Promise<BusinessUser> {
  const u = await requireBusiness();
  if (u.business.status !== "APPROVED") redirect("/account?pending=1");
  return u;
}
