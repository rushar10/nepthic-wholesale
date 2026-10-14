import { SkGrid, SkLine } from "@/ui/ux/Skeleton";

/* Catalogue: title, category chips, search, then product cards in the same grid. */
export default function Loading() {
  return (
    <div className="stack" role="status" aria-label="Loading catalogue">
      <div className="stack-sm"><SkLine size="sm" /><div className="sk sk-line lg" style={{ height: 34 }} /><SkLine /></div>
      <div className="row">{[60, 80, 90, 70, 84].map((w, i) => <div key={i} className="sk" style={{ width: w, height: 36, borderRadius: 999 }} />)}</div>
      <div className="sk" style={{ height: 44, borderRadius: 999 }} />
      <SkGrid count={8} />
    </div>
  );
}
