"use client";
import { useEffect } from "react";
import { setServerCount, useCartCount } from "./cart";

/* Order badge that updates the moment something is added (optimistic), then settles on
   the server's number. `variant="nav"` is the bottom-bar bubble, `"count"` the header pill. */
export function CartBadge({ initial, variant = "nav" }: { initial: number; variant?: "nav" | "count" }) {
  useEffect(() => { setServerCount(initial); }, [initial]);
  const n = useCartCount(initial);
  if (n <= 0) return null;
  return <span className={variant === "nav" ? "bn-badge" : "count"} aria-label={`${n} units in your order`}>{n}</span>;
}
