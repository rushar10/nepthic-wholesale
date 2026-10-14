import { env } from "@/core/env";
import { importCatalogue } from "@/core/catalogue-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Scheduled catalogue import. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return new Response("Not found", { status: 404 });
  }
  const r = await importCatalogue("schedule");
  return Response.json(r, { status: r.ok ? 200 : 502 });
}
