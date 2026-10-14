import { businesses, count, db, eq, quotes, returnRequests } from "@/db";

/** Things waiting on the Wholesale team, for the rail badge, bell and overview. */
export async function pendingCounts() {
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [quotesN, returnsN, bizN] = await Promise.all([
    n(db.select({ n: count() }).from(quotes).where(eq(quotes.status, "REQUESTED"))),
    n(db.select({ n: count() }).from(returnRequests).where(eq(returnRequests.status, "PENDING"))),
    n(db.select({ n: count() }).from(businesses).where(eq(businesses.status, "PENDING"))),
  ]);
  return { quotes: quotesN, returns: returnsN, businesses: bizN, total: quotesN + returnsN + bizN };
}
