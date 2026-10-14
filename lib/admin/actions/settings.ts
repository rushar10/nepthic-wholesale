"use server";
import { revalidatePath } from "next/cache";
import { db, eq, sessions, settings, users, type Role } from "@/db";
import { hashPassword } from "@/core/auth";
import { audit } from "@/core/audit";
import { int, str, type FormState } from "@/core/forms";
import { requireAdmin } from "@/lib/admin/guard";
import { run } from "@/lib/admin/run";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export async function saveSettings(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAdmin();
    const values = {
      paymentMode: str(fd, "paymentMode") === "FULL" ? ("FULL" as const) : ("DEPOSIT" as const),
      depositPct: clamp(int(fd, "depositPct"), 5, 90),
      balanceDueDays: clamp(int(fd, "balanceDueDays"), 0, 120),
      quoteValidDays: clamp(int(fd, "quoteValidDays"), 1, 90),
      moqPerStyle: clamp(int(fd, "moqPerStyle"), 1, 1000),
      proximityRadius: clamp(int(fd, "proximityRadius"), 20, 400),
      proximityIntensity: clamp(parseFloat(str(fd, "proximityIntensity")) || 0, 0, 1),
      proximityEnabled: fd.get("proximityEnabled") === "on",
      updatedAt: new Date(),
    };
    await db.update(settings).set(values).where(eq(settings.id, 1));
    await audit(admin.id, "settings.saved", "Setting", "1", values);
    revalidatePath("/", "layout");
    return { ok: "Settings saved. Buyers see them on their next page load." };
  });
}

export async function addStaff(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAdmin();
    const email = str(fd, "email").toLowerCase();
    const name = str(fd, "name");
    const role = (["STAFF", "ADMIN"] as Role[]).find((r) => r === str(fd, "role")) ?? "STAFF";
    const password = String(fd.get("password") ?? "");
    if (!email.includes("@") || !name) return { error: "Name and email are required." };
    if (password.length < 10) return { error: "Temporary password needs at least 10 characters." };
    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) {
      if (existing.role === "BUSINESS") return { error: "That email belongs to a trade account. Use a separate staff email." };
      await db.update(users).set({ role }).where(eq(users.id, existing.id));
    } else {
      await db.insert(users).values({ email, name, role, passwordHash: await hashPassword(password) });
    }
    await audit(admin.id, "staff.added", "User", email, { role });
    revalidatePath("/admin/settings");
    return { ok: `${name} can now sign in as ${role.toLowerCase()}. Share the temporary password privately.` };
  });
}

export async function setRole(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "userId");
  if (id === admin.id) return; // can't demote yourself
  const role = (["STAFF", "ADMIN", "BUSINESS"] as Role[]).find((r) => r === str(fd, "role"));
  if (!role) return;
  // "Remove access" turns a staff login back into a plain account with no business attached.
  await db.update(users).set(role === "BUSINESS" ? { role, businessId: null } : { role }).where(eq(users.id, id));
  if (role === "BUSINESS") await db.delete(sessions).where(eq(sessions.userId, id));
  await audit(admin.id, "staff.role", "User", id, { role });
  revalidatePath("/admin/settings");
}
