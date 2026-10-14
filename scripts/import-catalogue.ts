/* npm run catalogue:import — copy the Clothing catalogue into this site's database now.
   Use from a server cron if you don't deploy on Vercel. Exits non-zero if the import failed
   (Wholesale keeps its last good copy either way). */
import { importCatalogue } from "../core/catalogue-import";
import { pool } from "../db";

importCatalogue("cli")
  .then((r) => {
    if (r.ok) console.log(`Catalogue imported: ${r.created} new, ${r.updated} updated, ${r.archived} archived.`);
    else { console.error(`Catalogue import failed: ${r.error}`); process.exitCode = 1; }
  })
  .finally(() => pool.end());
