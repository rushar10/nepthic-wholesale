"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { businesses, db, eq, or, users } from "@/db";
import { createSession, destroySession, hashPassword, loginWithPassword } from "@/core/auth";
import { isValidAbn, normaliseAbn } from "@/core/abn";
import { audit } from "@/core/audit";
import { sendEmail } from "@/core/email";
import { env } from "@/core/env";
import { str, zodMessage, type FormState } from "@/core/forms";

const safeNext = (n: string) => (n.startsWith("/") && !n.startsWith("//") ? n : "/account");

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const user = await loginWithPassword(str(fd, "email"), String(fd.get("password") ?? ""));
  if (!user) return { error: "That email and password don't match an account." };
  redirect(safeNext(str(fd, "next")));
}

export async function logout() {
  await destroySession();
  redirect("/");
}

const Register = z.object({
  name: z.string().min(2, "Enter your name."),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(10, "Use at least 10 characters for your password."),
  legalName: z.string().min(2, "Enter the business's legal name."),
  tradingName: z.string().min(2, "Enter the store or trading name."),
  abn: z.string().refine(isValidAbn, "That ABN isn't valid. Check the 11 digits."),
  phone: z.string().min(6, "Enter a phone number."),
  address: z.string().min(3, "Enter a street address."),
  city: z.string().min(2, "Enter a suburb or city."),
  state: z.enum(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"], { message: "Choose a state." }),
  postcode: z.string().regex(/^\d{4}$/, "Postcode is 4 digits."),
});

export async function registerBusiness(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = Register.safeParse(Object.fromEntries([...fd.keys()].map((k) => [k, str(fd, k)])));
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const v = parsed.data;
  const email = v.email.toLowerCase();
  const abn = normaliseAbn(v.abn);

  const clash = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (clash) return { error: "An account with this email already exists. Sign in instead." };
  const abnClash = await db.query.businesses.findFirst({ where: or(eq(businesses.abn, abn)) });
  if (abnClash) return { error: "This ABN already has a trade account. Ask its owner to add you, or contact us." };

  const passwordHash = await hashPassword(v.password);
  const userId = await db.transaction(async (tx) => {
    const [b] = await tx.insert(businesses).values({
      legalName: v.legalName, tradingName: v.tradingName, abn, phone: v.phone,
      address: v.address, city: v.city, state: v.state, postcode: v.postcode,
    }).returning();
    const [u] = await tx.insert(users).values({ email, name: v.name, passwordHash, role: "BUSINESS", businessId: b.id }).returning();
    return u.id;
  });
  await audit(userId, "business.registered", "Business", abn);
  if (env.adminNotifyEmail) {
    await sendEmail(env.adminNotifyEmail, `New trade account: ${v.tradingName}`,
      `<p>${v.tradingName} (ABN ${abn}) applied for a trade account.</p><p><a href="${env.siteUrl}/admin/businesses">Review in Wholesale admin</a></p>`);
  }
  await createSession(userId);
  redirect("/account?welcome=1");
}
