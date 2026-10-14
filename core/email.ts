import { Resend } from "resend";
import { db, emailLog } from "@/db";
import { env } from "./env";
import { aud } from "@/ui/format";

/* Every email is logged to EmailLog. With RESEND_API_KEY set it is also sent. */

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

type Attachment = { filename: string; content: Buffer };

export async function sendEmail(to: string, subject: string, html: string, attachments?: Attachment[]) {
  await db.insert(emailLog).values({ to, subject, html });
  if (!resend) {
    console.info(`[email] to=${to} subject="${subject}"`);
    return;
  }
  try {
    await resend.emails.send({ from: env.emailFrom, to, subject, html, attachments });
  } catch (e) {
    console.error("[email] send failed", e);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, body: string, cta?: { label: string; href: string }) {
  return `<!doctype html><html><body style="margin:0;background:#0E0B14;font-family:Helvetica,Arial,sans-serif;color:#F4F1FA">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#17131F;border:1px solid #2B2338;border-radius:24px">
  <tr><td style="padding:28px 28px 8px;font-weight:800;letter-spacing:4px;font-size:14px;color:#F4F1FA">NEPTHIC <span style="color:#2DD4BF;letter-spacing:2px;font-size:11px">WHOLESALE</span></td></tr>
  <tr><td style="padding:8px 28px 4px;font-size:22px;font-weight:700">${esc(title)}</td></tr>
  <tr><td style="padding:8px 28px 24px;font-size:15px;line-height:1.6;color:#A59DB5">${body}
  ${cta ? `<p style="margin:24px 0 0"><a href="${cta.href}" style="background:#2DD4BF;color:#0E0B14;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">${esc(cta.label)}</a></p>` : ""}
  </td></tr></table></td></tr></table></body></html>`;
}

const p = (s: string) => `<p style="margin:0 0 12px">${s}</p>`;

export const emails = {
  quoteReceived: (to: string, n: number, type: "QUOTE" | "ENQUIRY") =>
    sendEmail(to, `We've got your ${type === "QUOTE" ? "quote request" : "enquiry"} Q-${n}`,
      layout("Thanks, we're on it", p(`Your ${type === "QUOTE" ? "quote request" : "enquiry"} <b>Q-${n}</b> is with our wholesale team. We reply within two business days.`),
        { label: "View in your account", href: `${env.siteUrl}/account?tab=quotes` })),

  newQuoteForTeam: (n: number, business: string) =>
    env.adminNotifyEmail &&
    sendEmail(env.adminNotifyEmail, `New wholesale request Q-${n} from ${business}`,
      layout("New wholesale request", p(`${esc(business)} sent Q-${n}.`), { label: "Open in the Admin Portal", href: `${env.portalUrl}/wholesale/quotes` })),

  quoteSent: (to: string, n: number, amountCents: number, terms: string, reply: string, quoteId: string) =>
    sendEmail(to, `Your Nepthic quote Q-${n}: ${aud(amountCents)}`,
      layout(`Quote Q-${n} is ready`, p(`Total <b>${aud(amountCents)}</b> inc GST · ${esc(terms)}`) + (reply ? p(esc(reply)) : ""),
        { label: "Review and accept", href: `${env.siteUrl}/account/quotes/${quoteId}` })),

  enquiryAnswered: (to: string, n: number, reply: string) =>
    sendEmail(to, `Reply to your enquiry Q-${n}`, layout("We replied to your enquiry", p(esc(reply)),
      { label: "View in your account", href: `${env.siteUrl}/account?tab=quotes` })),

  orderPayment: (to: string, n: number, paidCents: number, totalCents: number, orderId: string) =>
    sendEmail(to, paidCents >= totalCents ? `Order WO-${n} is paid in full` : `Deposit received for order WO-${n}`,
      layout(paidCents >= totalCents ? `Order WO-${n} is paid` : `Deposit received for WO-${n}`,
        p(`Paid so far: <b>${aud(paidCents)}</b> of ${aud(totalCents)}.`) +
          p(paidCents >= totalCents ? "We'll email tracking when it ships." : "We'll ask for the balance before dispatch."),
        { label: "View order", href: `${env.siteUrl}/account/orders/${orderId}` })),

  balanceRequested: (to: string, n: number, dueCents: number, dueBy: Date, orderId: string) =>
    sendEmail(to, `Balance due for order WO-${n}`,
      layout(`Your order WO-${n} is ready to ship`, p(`Please pay the balance of <b>${aud(dueCents)}</b> by ${dueBy.toLocaleDateString("en-AU", { day: "numeric", month: "long" })}.`),
        { label: "Pay balance", href: `${env.siteUrl}/account/orders/${orderId}` })),

  orderShipped: (to: string, n: number, orderId: string) =>
    sendEmail(to, `Order WO-${n} has shipped`, layout(`WO-${n} is on its way`, p("Your order has left our warehouse."),
      { label: "View order", href: `${env.siteUrl}/account/orders/${orderId}` })),

  returnReceived: (to: string, n: number) =>
    sendEmail(to, `Return request R-${n} received`, layout("We're reviewing your return",
      p(`Return <b>R-${n}</b> is with our team. Please keep the items until we reply. Nothing should be sent back before approval.`))),

  returnDecision: (to: string, n: number, approved: boolean, note: string) =>
    sendEmail(to, `Return R-${n} ${approved ? "approved" : "not approved"}`,
      layout(approved ? `Return R-${n} approved` : `Return R-${n} not approved`, p(esc(note)),
        { label: "View returns", href: `${env.siteUrl}/account?tab=returns` })),

  businessApproved: (to: string, name: string) =>
    sendEmail(to, "Your Nepthic trade account is approved", layout("You're approved",
      p(`${esc(name)} can now see trade prices and place bulk orders.`), { label: "Start an order", href: `${env.siteUrl}/catalogue` })),

};
