import { SkLine } from "@/ui/ux/Skeleton";

/* Product: picture and details on the left, the size breakdown panel on the right. */
export default function Loading() {
  return (
    <div className="stack" role="status" aria-label="Loading product">
      <div className="sk" style={{ width: 110, height: 32, borderRadius: 999 }} />
      <div className="split">
        <div className="stack">
          <div className="sk" style={{ aspectRatio: "4 / 3", borderRadius: "var(--r-md)" }} />
          <div className="stack-sm"><SkLine size="sm" /><div className="sk sk-line lg" style={{ height: 34 }} /><SkLine /><SkLine /></div>
        </div>
        <div className="panel prox stack-sm">
          <SkLine size="sm" />
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="sk" style={{ height: 60, borderRadius: 12 }} />)}
          <div className="sk" style={{ height: 56, borderRadius: 16 }} />
        </div>
      </div>
    </div>
  );
}
