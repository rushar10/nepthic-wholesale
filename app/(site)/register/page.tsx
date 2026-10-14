import Link from "next/link";
import { ActionForm, Submit } from "@/ui/Forms";
import { registerBusiness } from "@/app/actions/auth";

export const metadata = { title: "Apply for a trade account" };

const STATES = ["QLD", "NSW", "VIC", "ACT", "SA", "WA", "TAS", "NT"];

export default function Register() {
  return (
    <div className="stack" style={{ maxWidth: 760, marginInline: "auto" }}>
      <div className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Trade account</p>
        <h1 className="page">Apply to stock Nepthic</h1>
        <p className="lede">We review every application, usually within one business day. You&apos;ll see trade prices once approved.</p>
      </div>
      <ActionForm action={registerBusiness} className="panel prox">
        <h2 className="h3">Business</h2>
        <div className="form-grid">
          <label className="f">Legal name<input type="text" name="legalName" required autoComplete="organization" /></label>
          <label className="f">Store or trading name<input type="text" name="tradingName" required /></label>
          <label className="f">ABN<input type="text" name="abn" inputMode="numeric" placeholder="11 digits" required /></label>
          <label className="f">Phone<input type="tel" name="phone" required autoComplete="tel" /></label>
          <label className="f full">Street address<input type="text" name="address" required autoComplete="street-address" /></label>
          <label className="f">Suburb or city<input type="text" name="city" required autoComplete="address-level2" /></label>
          <label className="f">State<select name="state" defaultValue="QLD">{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="f">Postcode<input type="text" name="postcode" inputMode="numeric" maxLength={4} required autoComplete="postal-code" /></label>
        </div>
        <h2 className="h3">Your login</h2>
        <div className="form-grid">
          <label className="f">Your name<input type="text" name="name" required autoComplete="name" /></label>
          <label className="f">Email<input type="email" name="email" required autoComplete="email" /></label>
          <label className="f">Password<input type="password" name="password" minLength={10} required autoComplete="new-password" /></label>
        </div>
        <div className="row"><Submit pendingText="Submitting…">Submit application</Submit><span className="dim small">Already have one? <Link href="/login">Sign in</Link></span></div>
      </ActionForm>
    </div>
  );
}
