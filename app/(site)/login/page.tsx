import Link from "next/link";
import { ActionForm, Submit } from "@/ui/Forms";
import { login } from "@/app/actions/auth";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string }> }) {
  const { next, denied } = await searchParams;
  return (
    <div className="auth stack">
      <div className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Trade account</p>
        <h1 className="page">Sign in</h1>
        <p className="dim">One Nepthic login works across Wholesale, Events and the store.</p>
      </div>
      {denied && <p className="note warn">That page is for trade accounts. Sign in with your business login.</p>}
      <ActionForm action={login} className="panel prox">
        <input type="hidden" name="next" value={next ?? "/account"} />
        <label className="f">Email<input type="email" name="email" autoComplete="email" required /></label>
        <label className="f">Password<input type="password" name="password" autoComplete="current-password" required /></label>
        <Submit pendingText="Signing in…">Sign in</Submit>
      </ActionForm>
      <p className="dim small">New stockist? <Link href="/register">Apply for a trade account</Link>.</p>
    </div>
  );
}
