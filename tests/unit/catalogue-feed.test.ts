import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFeed } from "../../core/catalogue-feed";

const sample = JSON.parse(readFileSync(new URL("../../data/clothing-catalogue.sample.json", import.meta.url), "utf8"));

test("the sample Clothing feed is valid v1", () => {
  const f = parseFeed(sample);
  assert.equal(f.version, 1);
  assert.ok(f.products.length >= 6);
  assert.ok(f.products.every((p) => p.sizes.length > 0 && p.priceCents > 0));
});

test("wrong version, bad slugs and duplicate ids are rejected whole", () => {
  assert.throws(() => parseFeed({ ...sample, version: 2 }), /isn't valid/);
  assert.throws(() => parseFeed({ ...sample, products: [{ ...sample.products[0], slug: "Bad Slug" }] }), /slugs are lowercase/);
  assert.throws(() => parseFeed({ ...sample, products: [sample.products[0], sample.products[0]] }), /twice/);
  assert.throws(() => parseFeed({ version: 1, products: [{ ...sample.products[0], sizes: [] }] }), /isn't valid/);
});
