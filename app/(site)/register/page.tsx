import Link from "next/link";
import { ActionForm, Submit } from "@/ui/Forms";
import { registerBusiness } from "@/app/actions/auth";
import { Field } from "@/ui/ux/Field";
import { Wizard } from "@/ui/ux/Wizard";

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
      <ActionForm action={registerBusiness} className="panel prox" persist="register">
        <Wizard steps={["Your business", "Address", "Your login"]} submit={<Submit pendingText="Submitting…">Submit application</Submit>}>
          <div className="form-grid">
            <Field label="Legal name" name="legalName" required autoComplete="organization" autoCapitalize="words" />
            <Field label="Store or trading name" name="tradingName" required autoCapitalize="words" />
            <Field label="ABN" name="abn" inputMode="numeric" required pattern="[0-9 ]{11,14}" patternMessage="An ABN is 11 digits, e.g. 51 824 753 556" hint="11 digits. We check it with ABN Lookup." />
            <Field label="Phone" type="tel" name="phone" required autoComplete="tel" inputMode="tel" />
          </div>
          <div className="form-grid">
            <Field full label="Street address" name="address" required autoComplete="street-address" />
            <Field label="Suburb or city" name="city" required autoComplete="address-level2" autoCapitalize="words" />
            <label className="fl"><select id="f-state" name="state" defaultValue="QLD" autoComplete="address-level1">{STATES.map((s) => <option key={s}>{s}</option>)}</select><span className="fl-label">State</span><span className="fl-msg" /></label>
            <Field label="Postcode" name="postcode" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" patternMessage="Postcodes are 4 digits" required autoComplete="postal-code" />
          </div>
          <div className="form-grid">
            <Field label="Your name" name="name" required autoComplete="name" autoCapitalize="words" />
            <Field label="Email" type="email" name="email" required autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} />
            <Field label="Password" type="password" name="password" minLength={10} required autoComplete="new-password" hint="At least 10 characters" />
            <p className="dim small full">Already have an account? <Link href="/login">Sign in</Link></p>
          </div>
        </Wizard>
      </ActionForm>
    </div>
  );
}
