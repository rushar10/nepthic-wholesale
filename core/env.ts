const isProd = process.env.NODE_ENV === "production";

function secret(name: string, devFallback: string) {
  const v = process.env[name];
  if (v) return v;
  if (isProd && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error(`${name} must be set in production`);
  }
  return devFallback;
}

export const env = {
  /** This site's own address (emails, Stripe redirects). */
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001").replace(/\/$/, ""),
  /** Where the Nepthic logo points: "/" (this site's home) unless set to the gateway. */
  logoHref: process.env.NEXT_PUBLIC_LOGO_HREF || "/",
  /** Read-only summary API for the Nepthic Overview dashboard; empty = endpoint off. */
  overviewToken: process.env.OVERVIEW_API_TOKEN ?? "",
  /** Where the Clothing catalogue feed lives (https://… or file:…). Read by the scheduled import only. */
  catalogueUrl: process.env.CLOTHING_CATALOGUE_URL ?? "file:data/clothing-catalogue.sample.json",
  catalogueToken: process.env.CLOTHING_CATALOGUE_TOKEN ?? "",
  /** Protects the scheduled-import endpoint (Vercel Cron sends it as a bearer token). */
  cronSecret: process.env.CRON_SECRET ?? "",
  paymentsMode: ((process.env.PAYMENTS_MODE as "mock" | "stripe" | undefined) ??
    (process.env.STRIPE_SECRET_KEY ? "stripe" : "mock")) as "mock" | "stripe",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "Nepthic Wholesale <wholesale@nepthic.com>",
  adminNotifyEmail: process.env.ADMIN_NOTIFY_EMAIL ?? "",
};

