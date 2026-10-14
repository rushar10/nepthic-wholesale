import { SkRows } from "@/ui/ux/Skeleton";

/* Account: business card, tabs, then order rows. */
export default function Loading() {
  return (
    <div className="stack" role="status" aria-label="Loading your account">
      <div className="sk" style={{ height: 78, borderRadius: "var(--r-md)" }} />
      <div className="row">{[90, 150, 90, 80].map((w, i) => <div key={i} className="sk" style={{ width: w, height: 36, borderRadius: 999 }} />)}</div>
      <SkRows count={4} />
    </div>
  );
}
