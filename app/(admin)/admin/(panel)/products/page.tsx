import { asc, catalogueImports, db, desc, isNotNull, isNull, products, variants } from "@/db";
import { env } from "@/core/env";
import { ActionForm, Submit } from "@/ui/Forms";
import { dateShort, time } from "@/ui/format";
import { guard } from "@/lib/admin/guard";
import { createProduct, runImport, saveProduct } from "@/lib/admin/actions/catalogue";

export const metadata = { title: "Products" };

export default async function Products() {
  await guard("products");
  const [live, archived, runs] = await Promise.all([
    db.query.products.findMany({ where: isNull(products.archivedAt), orderBy: asc(products.sortOrder), with: { variants: { orderBy: asc(variants.sortOrder) } } }),
    db.query.products.findMany({ where: isNotNull(products.archivedAt), orderBy: desc(products.archivedAt), limit: 20 }),
    db.query.catalogueImports.findMany({ orderBy: desc(catalogueImports.startedAt), limit: 5 }),
  ]);
  const lastOk = runs.find((r) => r.status === "SUCCEEDED");
  const source = env.catalogueUrl.startsWith("file:") ? "sample file (local development)" : new URL(env.catalogueUrl).host;

  return (
    <>
      <div>
        <p className="eyebrow">Wholesale</p>
        <h1 className="page" style={{ marginTop: 6 }}>Products &amp; stock</h1>
        <p className="dim" style={{ marginTop: 6, maxWidth: "70ch" }}>
          Products come from the Clothing catalogue on a schedule and are stored here, so this site keeps selling even when Clothing is offline.
          Names, RRPs and sizes follow Clothing. Wholesale stock, listing and wholesale-only products are managed on this page.
        </p>
      </div>

      <section className="panel prox" aria-labelledby="imp">
        <div className="spread">
          <div>
            <h2 className="h3" id="imp">Catalogue import</h2>
            <p className="small dim" style={{ marginTop: 4 }}>
              Source: {source} · runs daily at 3am Brisbane time{lastOk ? ` · last good copy ${dateShort(lastOk.finishedAt ?? lastOk.startedAt)} ${time(lastOk.finishedAt ?? lastOk.startedAt)}` : " · no successful import yet"}
            </p>
          </div>
          <ActionForm action={runImport}><Submit className="btn btn-sm prox" pendingText="Importing…">Import now</Submit></ActionForm>
        </div>
        {runs.length > 0 && (
          <div className="scroll"><table className="tbl rtable">
            <thead><tr><th>Started</th><th>Trigger</th><th>Result</th><th className="num">New</th><th className="num">Updated</th><th className="num">Archived</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="small">{dateShort(r.startedAt)} {time(r.startedAt)}</td>
                  <td data-label="Trigger" className="small">{r.trigger}</td>
                  <td data-label="Result">{r.status === "SUCCEEDED" ? <span className="pill ok">Imported</span> : r.status === "FAILED" ? <span className="pill bad" title={r.error ?? ""}>Failed: {r.error?.slice(0, 80)}</span> : <span className="pill info">Running</span>}</td>
                  <td className="num" data-label="New">{r.created}</td><td className="num" data-label="Updated">{r.updated}</td><td className="num" data-label="Archived">{r.archived}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <div className="cards">
        {live.map((p) => {
          const total = p.variants.reduce((a, v) => a + v.stock, 0);
          const low = p.variants.filter((v) => v.stock < 20).length;
          const imported = !!p.sourceId;
          return (
            <ActionForm key={p.id} action={saveProduct} className="card prox" id={p.slug}>
              <input type="hidden" name="productId" value={p.id} />
              <div className="spread">
                <div><b>{p.name}</b> <span className="dim small">{p.category} · /{p.slug}</span></div>
                <div className="row">
                  {imported
                    ? <span className="pill info" title={`Clothing id ${p.sourceId}`}>From Clothing{p.syncedAt ? ` · synced ${dateShort(p.syncedAt)}` : ""}</span>
                    : <span className="pill">Wholesale only</span>}
                  <span className="pill">{total} allocated</span>
                  {low > 0 && <span className="pill warn">{low} size{low > 1 ? "s" : ""} under 20</span>}
                </div>
              </div>
              <div className="row" style={{ alignItems: "end" }}>
                <label className="f" style={{ width: 120 }}>RRP ($)
                  <input type="number" name="price" step="0.01" min="0" defaultValue={(p.priceCents / 100).toFixed(2)} readOnly={imported}
                    title={imported ? "Set by the Clothing catalogue" : undefined} aria-describedby={imported ? `rrp-${p.id}` : undefined} />
                </label>
                {p.variants.map((v) => (
                  <label key={v.id} className="f" style={{ width: 82 }}>{v.size}<input type="number" name={`stock_${v.id}`} min="0" defaultValue={v.stock} aria-label={`${p.name} ${v.size} wholesale stock`} /></label>
                ))}
                {!imported && <>
                  <label className="f" style={{ width: 82 }}>New size<input type="text" name="newSize" placeholder="XXXL" /></label>
                  <label className="f" style={{ width: 82 }}>Stock<input type="number" name="newStock" min="0" placeholder="0" /></label>
                </>}
              </div>
              {imported && <p className="small dim" id={`rrp-${p.id}`}>RRP, name and sizes follow the Clothing catalogue. Stock here is the wholesale allocation.</p>}
              <div className="row">
                <label className="row small"><input type="checkbox" name="wholesaleEnabled" defaultChecked={p.wholesaleEnabled} /> Listed on Wholesale</label>
                {!imported && <label className="f" style={{ flex: 1, minWidth: 220 }}><span className="sr-only">Image URL</span><input type="text" name="imageUrl" defaultValue={p.imageUrl ?? ""} placeholder="Image URL (optional)" /></label>}
                <Submit className="btn btn-sm prox" pendingText="Saving…">Save</Submit>
              </div>
            </ActionForm>
          );
        })}
        {live.length === 0 && <div className="empty">No products yet. Run an import, or add a wholesale-only product below.</div>}
      </div>

      {archived.length > 0 && (
        <section className="panel prox">
          <h2 className="h3">No longer in the Clothing catalogue</h2>
          <p className="small dim">Hidden from buyers and kept for past orders. They come back automatically if Clothing lists them again.</p>
          <ul className="small">{archived.map((p) => <li key={p.id}>{p.name} · archived {dateShort(p.archivedAt!)}</li>)}</ul>
        </section>
      )}

      <ActionForm action={createProduct} className="panel prox">
        <h2 className="h3">Add a wholesale-only product</h2>
        <p className="small dim">For trade-only lines that aren&apos;t sold on the Clothing store. The import never touches these.</p>
        <div className="form-grid">
          <label className="f">Name<input type="text" name="name" required /></label>
          <label className="f">Category
            <select name="category">{["Tees", "Hoodies", "Crewnecks", "Outerwear", "Bottoms", "Headwear"].map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="f">RRP ($)<input type="number" name="price" step="0.01" min="0" required /></label>
          <label className="f">Sizes (comma separated)<input type="text" name="sizes" defaultValue="S, M, L, XL, XXL" required /></label>
          <label className="f">Starting stock per size<input type="number" name="stock" min="0" defaultValue={0} /></label>
          <label className="f">Link (optional)<input type="text" name="slug" placeholder="auto from name" /></label>
          <label className="f full">Description<textarea name="description" /></label>
        </div>
        <label className="row small"><input type="checkbox" name="wholesaleEnabled" defaultChecked /> List on Wholesale</label>
        <Submit pendingText="Adding…">Add product</Submit>
      </ActionForm>
    </>
  );
}
