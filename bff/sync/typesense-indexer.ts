// =============================================================================
// Search Engine Offload (Rule 4) — the indexer side.
// =============================================================================
// The BFF owns the search index. Odoo's job ends at the OdooClient boundary.
// The BFF normalises Odoo records against the versioned contract, drops
// anything whose validation_state is not "live", and upserts the rest into
// Typesense. The storefront then queries Typesense via the BFF — Odoo is
// never on the hot path of a customer click.
// =============================================================================

import { Client as Typesense } from "typesense";
import { Product, ProductSchema } from "../contracts/product.js";
import { OdooClient } from "./odoo-client.js";

const COLLECTION = "products_martial_arts_ch";

export function makeTypesenseClient(): Typesense {
  return new Typesense({
    nodes: [{
      host: process.env.TYPESENSE_HOST || "localhost",
      port: Number(process.env.TYPESENSE_PORT || 8108),
      protocol: process.env.TYPESENSE_PROTOCOL || "http",
    }],
    apiKey: process.env.TYPESENSE_API_KEY || "demo-key",
    connectionTimeoutSeconds: 5,
  });
}

const SCHEMA = {
  name: COLLECTION,
  enable_nested_fields: true,
  fields: [
    { name: "slug", type: "string" as const },
    { name: "sku", type: "string" as const },
    { name: "brand", type: "string" as const, facet: true },
    { name: "category_slugs", type: "string[]" as const, facet: true },
    { name: "size", type: "string" as const, facet: true },
    { name: "weight_oz", type: "string" as const, facet: true },
    { name: "color", type: "string" as const, facet: true },
    { name: "in_stock", type: "bool" as const, facet: true },
    { name: "price_chf", type: "float" as const },
    { name: "name_de", type: "string" as const, locale: "de" },
    { name: "name_en", type: "string" as const, locale: "en" },
    { name: "image", type: "string" as const },
  ],
  default_sorting_field: "price_chf",
};

export async function ensureCollection(ts: Typesense) {
  try {
    await ts.collections(COLLECTION).retrieve();
  } catch {
    await ts.collections().create(SCHEMA as any);
  }
}

/**
 * Read all products from Odoo, validate against Product@v1, drop anything
 * not `live`, flatten to the search-index shape, and upsert into Typesense.
 *
 * In production this runs from a one-minute cron driven by Odoo
 * `write_date > last_sync_ts` plus a write-hook on product.product / product.template
 * so the search index converges within ~60s of any Odoo edit.
 */
export async function syncOnce(odoo: OdooClient, ts: Typesense) {
  await ensureCollection(ts);
  const raw = await odoo.fetchAllProducts();
  // Contract validation — anything that doesn't match the contract is
  // dropped LOUDLY so we can find drift fast.
  const validated: Product[] = [];
  for (const p of raw) {
    const r = ProductSchema.safeParse(p);
    if (!r.success) {
      console.warn("[sync] dropped invalid product:", p.slug, r.error.message);
      continue;
    }
    validated.push(r.data);
  }
  const live = validated.filter(p => p.validation_state === "live");
  console.log(`[sync] ${live.length} live products (of ${validated.length} valid)`);

  const docs = live.map(p => ({
    id: p.slug,
    slug: p.slug,
    sku: p.sku,
    brand: p.brand,
    category_slugs: p.category_slugs,
    size: p.attributes.size,
    weight_oz: p.attributes.weight_oz,
    color: p.attributes.color,
    in_stock: p.in_stock,
    price_chf: p.price_chf,
    name_de: p.name.de || "",
    name_en: p.name.en || "",
    image: p.image,
  }));
  if (!docs.length) return;
  await ts.collections(COLLECTION).documents().import(docs, { action: "upsert" });
}

export { COLLECTION };
