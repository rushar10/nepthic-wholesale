import Link from "next/link";
import { and, desc, db, eq, inArray, orders } from "@/db";
import { dateShort, orderNo } from "@/ui/format";
import { ActionForm, Submit } from "@/ui/Forms";
import { requireApprovedBusiness } from "@/lib/session";
import { submitReturn } from "@/app/actions/returns";
import { RETURN_REASONS } from "@/lib/constants";

export const metadata = { title: "Request a return" };

export default async function NewReturn({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const [{ order }, user] = await Promise.all([searchParams, requireApprovedBusiness()]);
  const eligible = await db.query.orders.findMany({
    where: and(eq(orders.businessId, user.businessId!), inArray(orders.fulfilment, ["SHIPPED", "DELIVERED"])),
    orderBy: desc(orders.createdAt),
  });

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <Link className="btn btn-ghost btn-sm" href="/account?tab=returns" style={{ justifySelf: "start" }}>← Returns</Link>
      <div className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Returns</p>
        <h1 className="page">Request a return</h1>
        <p className="lede">Our team reviews every request. Please keep the items until we approve it; we&apos;ll send instructions and a label.</p>
      </div>
      {eligible.length === 0 ? <div className="empty">Returns open once an order has shipped.</div> : (
        <ActionForm action={submitReturn} className="panel prox">
          <div className="form-grid">
            <label className="f">Order
              <select name="orderId" defaultValue={order}>
                {eligible.map((o) => <option key={o.id} value={o.id}>{orderNo(o.number)} · {dateShort(o.createdAt)}</option>)}
              </select>
            </label>
            <label className="f">Reason<select name="reason">{RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="f">Units affected<input type="number" name="units" min={1} defaultValue={1} required /></label>
            <label className="f full">What happened<textarea name="details" required minLength={10} placeholder="Which styles and sizes, and what's wrong with them." /></label>
            <label className="f full">Photos (up to 6, 5 MB each)<input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/heic" multiple /></label>
          </div>
          <Submit pendingText="Uploading…">Submit for review</Submit>
        </ActionForm>
      )}
    </div>
  );
}
