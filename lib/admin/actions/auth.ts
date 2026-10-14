"use server";
import { redirect } from "next/navigation";
import { STAFF_ROLES, destroySession, loginWithPassword } from "@/core/auth";
import { str, type FormState } from "@/core/forms";

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const user = await loginWithPassword(str(fd, "email"), String(fd.get("password") ?? ""));
  if (!user) return { error: "That email and password don't match a staff account." };
  if (!STAFF_ROLES.includes(user.role)) {
    await destroySession();
    return { error: "This account doesn't have dashboard access. Ask an admin to add you." };
  }
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/admin/login");
}
