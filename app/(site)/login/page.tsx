import Link from "next/link";
import { ActionForm, Submit } from "@/ui/Forms";
import { login } from "@/app/actions/auth";
import { Field } from "@/ui/ux/Field";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string }> }) {
  const { next, denied } = await searchParams;
  return (
    <div className="auth stack">
      <div className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Trade account</p>
        <h1 className="page">Sign in</h1>
        <p className="dim">Your Nepthic Wholesale login. It&apos;s separate from the Nepthic store and Events.</p>
      </div>
      {denied && <p className="note warn">That page is for trade accounts. Sign in with your business login.</p>}
      <ActionForm action={login} className="panel prox">
        <input type="hidden" name="next" value={next ?? "/account"} />
        <Field label="Email" type="email" name="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required />
        <Field label="Password" type="password" name="password" autoComplete="current-password" required />
        <Submit pendingText="Signing in…">Sign in</Submit>
      </ActionForm>
      <p className="dim small">New stockist? <Link href="/register">Apply for a trade account</Link>.</p>
    </div>
  );
}
