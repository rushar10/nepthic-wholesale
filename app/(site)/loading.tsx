import { SkGrid, SkLine } from "@/ui/ux/Skeleton";

/* Home: hero text, the four tier tiles, then the product grid. */
export default function Loading() {
  return (
    <div className="stack" role="status" aria-label="Loading">
      <div className="stack-sm"><SkLine size="sm" /><div className="sk sk-line lg" style={{ height: 44, width: "70%" }} /><SkLine /><SkLine size="sm" /></div>
      <div className="tiers">{Array.from({ length: 4 }, (_, i) => <div key={i} className="sk" style={{ height: 92, borderRadius: "var(--r-md)" }} />)}</div>
      <SkGrid count={4} />
    </div>
  );
}
