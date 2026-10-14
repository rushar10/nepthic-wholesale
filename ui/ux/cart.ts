"use client";
import { useSyncExternalStore } from "react";

/* Optimistic cart count. The server's number is the truth; while an add or remove is in
   flight, the badge shows the expected number straight away and falls back if it fails. */
let server = 0;
let pending = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setServerCount(n: number) {
  if (n === server) return;
  server = n;
  pending = 0;                    // the server has caught up
  emit();
}
export function addPending(delta: number) { pending += delta; emit(); }
export function rollback(delta: number) { pending -= delta; emit(); }

export function useCartCount(initial: number) {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => Math.max(0, (server || initial) + pending),
    () => initial,
  );
}

/** Flies a copy of `from` (e.g. the product image) into the element matching `to`, then bumps it. */
export function flyTo(from: Element | null, toSelector = "[data-cart-target]") {
  const targets = [...document.querySelectorAll<HTMLElement>(toSelector)].filter((t) => t.getClientRects().length && t.offsetParent !== null);
  const target = targets[0];
  if (!target) return;
  const bump = () => { target.classList.remove("bump"); void target.offsetWidth; target.classList.add("bump"); };
  if (!from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { bump(); return; }
  const a = from.getBoundingClientRect(), b = target.getBoundingClientRect();
  const clone = from.cloneNode(true) as HTMLElement;
  clone.classList.add("fly");
  Object.assign(clone.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: "0" });
  clone.style.viewTransitionName = "none";
  document.body.appendChild(clone);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const s = Math.max(0.08, Math.min(b.width / a.width, 0.2));
  const anim = clone.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 80}px) scale(${(1 + s) / 2})`, opacity: 0.95, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.2 },
    ],
    { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" },
  );
  anim.onfinish = () => { clone.remove(); bump(); };
}
