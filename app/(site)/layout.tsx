import "@/ui/fonts.css";
import "@/ui/styles.css";
import "@/ui/glow/glow.css";
import type { Metadata, Viewport } from "next";
import { SiteHeader, Footer } from "@/ui/SiteHeader";
import { Proximity } from "@/ui/Proximity";
import { Reveal } from "@/ui/Reveal";
import { BottomNav, RegisterSW } from "@/ui/Mobile";
import { getUser } from "@/core/auth";
import { getSettings } from "@/core/settings";
import { env } from "@/core/env";
import { readCart } from "@/lib/cart";
import { logout } from "@/app/actions/auth";

// Every page reads this site's settings and session, so nothing is prerendered at build time
// (the build never needs the database).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Nepthic Wholesale", template: "%s · Nepthic Wholesale" },
  description: "Bulk Nepthic streetwear for stockists: volume pricing, custom quotes and trade accounts.",
  appleWebApp: { capable: true, title: "Nepthic Trade", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0E0B14",
  viewportFit: "cover", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, settings, cart] = await Promise.all([getUser(), getSettings(), readCart()]);
  const units = Object.values(cart).reduce((a, b) => a + b, 0);
  const account = user ? (
    <>
      <a href="/account">{user.business?.tradingName ?? user.name}</a>
      <form action={logout}><button type="submit">Sign out</button></form>
    </>
  ) : <a href="/login">Sign in</a>;

  return (
    <html lang="en-AU">
      <body className="site-ws has-bottom-nav">
        <SiteHeader
          siteName="Wholesale"
          logoHref={env.logoHref}
          nav={<>
            <a href="/catalogue">Catalogue</a>
            <a href="/order">Order{units > 0 && <span className="count">{units}</span>}</a>
            <a href="/quote">Quote</a>
          </>}
          menu={<>
            <a href="/account?tab=returns">Returns</a>
            {!user && <a href="/register">Apply for a trade account</a>}
          </>}
          account={account}
        />
        <Reveal enabled={settings.proximityEnabled} strength={0.5} palette={[{ color: "#2DD4BF", x: 0.2, y: 0.35 }, { color: "#8B5CF6", x: 0.85, y: 0.1 }, { color: "#5EEAD4", x: 0.7, y: 0.8 }]} />
        <Proximity radius={settings.proximityRadius} intensity={settings.proximityIntensity} enabled={settings.proximityEnabled} />
        <RegisterSW signedIn={!!user} />
        <main className="wrap">{children}</main>
        <Footer siteName="Wholesale" />
        <BottomNav label="Wholesale" items={[
          { href: "/", label: "Home", icon: "home" },
          { href: "/catalogue", label: "Catalogue", icon: "grid" },
          { href: "/order", label: "Order", icon: "bag", badge: units },
          { href: "/quote", label: "Quote", icon: "chat" },
          { href: user ? "/account" : "/login", label: user ? "Account" : "Sign in", icon: "user", match: ["/account", "/login", "/register"] },
        ]} />
      </body>
    </html>
  );
}
