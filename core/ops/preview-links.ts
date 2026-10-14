/** What the admin preview bar offers for the page being viewed: a portal link per page type. */
export function editLinks(path: string): { label: string; href: string }[] {
  const p = path.split("?")[0];
  const m = /^\/catalogue\/([^/]+)$/.exec(p);
  if (m) return [{ label: "Edit this product", href: `/wholesale/products#${encodeURIComponent(m[1])}` }];
  if (p === "/catalogue") return [{ label: "Edit products & stock", href: "/wholesale/products" }, { label: "Pricing tiers", href: "/wholesale/pricing" }];
  if (p === "/quote") return [{ label: "Answer quotes", href: "/wholesale/quotes" }];
  if (p === "/order") return [{ label: "Bulk orders", href: "/wholesale/orders" }];
  if (p.startsWith("/account")) return [{ label: "Buyers", href: "/wholesale/customers" }, { label: "Returns", href: "/wholesale/returns" }];
  if (p === "/register") return [{ label: "Trade account approvals", href: "/wholesale/businesses" }];
  return [{ label: "Edit this page", href: "/wholesale" }];
}
