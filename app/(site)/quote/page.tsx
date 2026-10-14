import Link from "next/link";
import { getUser } from "@/core/auth";
import { QuoteWizard } from "./QuoteWizard";

export const metadata = { title: "Enquiry or quote" };

export default async function QuotePage() {
  const user = await getUser();
  const isBuyer = user?.role === "BUSINESS" && user.business;

  return (
    <div className="split">
      <div className="stack">
        <div className="hero" style={{ paddingBottom: 0 }}>
          <p className="eyebrow">Enquiry or quote</p>
          <h1 className="page">Tell us what you need</h1>
          <p className="lede">Ask a question, or request a quote for custom labels, colourways, packaging or volumes above our stock.</p>
        </div>
        {isBuyer ? (
          <QuoteWizard business={user.business!.tradingName} />
        ) : (
          <div className="panel prox">
            <p>Quotes are tied to a trade account so we can price for your business.</p>
            <div className="row">
              <Link className="btn btn-primary prox" href="/login?next=/quote">Sign in</Link>
              <Link className="btn prox" href="/register">Apply for a trade account</Link>
            </div>
          </div>
        )}
      </div>
      <aside className="panel prox">
        <p className="eyebrow">How quotes work</p>
        <ol className="stack-sm dim small" style={{ paddingLeft: "1.2em", margin: 0 }}>
          <li>Send the styles, quantities and timing.</li>
          <li>Our team prices it and sets the payment terms.</li>
          <li>Accept the quote in your account and it becomes an order.</li>
          <li>Pay the deposit or full amount shown on the quote.</li>
        </ol>
      </aside>
    </div>
  );
}
