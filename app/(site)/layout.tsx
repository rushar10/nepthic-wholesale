import "@/ui/fonts.css";
import "@/ui/styles.css";
import "@/ui/glow/glow.css";
import "@/ui/ux/ux.css";
import "@/ui/ux/ux-site.css";
import type { Metadata, Viewport } from "next";
import { SiteHeader, Footer } from "@/ui/SiteHeader";
import { PreviewBar } from "@/ui/PreviewBar";
import { Proximity } from "@/ui/Proximity";
import { Reveal } from "@/ui/Reveal";
import { BottomNav, RegisterSW } from "@/ui/Mobile";
import { getUser } from "@/core/auth";
import { getSettings } from "@/core/settings";
import { env } from "@/core/env";
import { readCart } from "@/lib/cart";
import { logout } from "@/app/actions/auth";
import { cookies } from "next/headers";
import { AppShell } from "@/ui/ux/AppShell";
import { ThemeSwitch } from "@/ui/ux/ThemeSwitch";
import { CartBadge } from "@/ui/ux/CartBadge";

// Every page reads this site's settings and session, so nothing is prerendered at build time
// (the build never needs the database).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Nepthic Wholesale", template: "%s · Nepthic Wholesale" },
  description: "Bulk Nepthic streetwear for stockists: volume pricing, custom quotes and trade accounts.",
  appleWebApp: { capable: true, title: "Nepthic Trade", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F6F3FB" }, { media: "(prefers-color-scheme: dark)", color: "#0E0B14" }],
  viewportFit: "cover", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, settings, cart, jar] = await Promise.all([getUser(), getSettings(), readCart(), cookies()]);
  const saved = jar.get("nep_theme")?.value;
  const theme = saved === "light" || saved === "dark" ? saved : null;
  const units = Object.values(cart).reduce((a, b) => a + b, 0);
  const account = user ? (
    <>
      <a href="/account">{user.business?.tradingName ?? user.name}</a>
      <form action={logout}><button type="submit">Sign out</button></form>
    </>
  ) : <a href="/login">Sign in</a>;

  return (
    <html lang="en-AU" data-theme={theme ?? undefined}>
      <body className="site-ws has-bottom-nav">
        <PreviewBar />
        <SiteHeader
          siteName="Wholesale"
          logoHref={env.logoHref}
          nav={<>
            <a href="/catalogue">Catalogue</a>
            <a href="/order" data-cart-target>Order<CartBadge initial={units} variant="count" /></a>
            <a href="/quote">Quote</a>
          </>}
          menu={<>
            <a href="/account?tab=returns">Returns</a>
            {!user && <a href="/register">Apply for a trade account</a>}
          </>}
          account={account}
          tools={<ThemeSwitch initial={theme} />}
        />
        <Reveal enabled={settings.proximityEnabled} strength={0.5} palette={[{ color: "#2DD4BF", x: 0.2, y: 0.35 }, { color: "#8B5CF6", x: 0.85, y: 0.1 }, { color: "#5EEAD4", x: 0.7, y: 0.8 }]} />
        <Proximity radius={settings.proximityRadius} intensity={settings.proximityIntensity} enabled={settings.proximityEnabled} />
        <RegisterSW signedIn={!!user} />
        <AppShell>
        <main className="wrap">{children}</main>
        <Footer siteName="Wholesale" />
        <BottomNav label="Wholesale" items={[
          { href: "/", label: "Home", icon: "home" },
          { href: "/catalogue", label: "Catalogue", icon: "grid" },
          { href: "/order", label: "Order", icon: "bag", badge: units, cart: true },
          { href: "/quote", label: "Quote", icon: "chat" },
          { href: user ? "/account" : "/login", label: user ? "Account" : "Sign in", icon: "user", match: ["/account", "/login", "/register"] },
        ]} />
        </AppShell>
      </body>
    </html>
  );
}
