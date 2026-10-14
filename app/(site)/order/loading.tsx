import { SkLine, SkRows } from "@/ui/ux/Skeleton";

/* Order: title, line items, then the totals panel. */
export default function Loading() {
  return (
    <div className="stack" role="status" aria-label="Loading your order">
      <div className="stack-sm"><SkLine size="sm" /><div className="sk sk-line lg" style={{ height: 34 }} /></div>
      <SkRows count={3} />
      <div className="sk" style={{ height: 160, borderRadius: "var(--r-md)" }} />
    </div>
  );
}
