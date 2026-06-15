// =============================================================================
// BFF entry point. Node 20 + Hono + GraphQL Yoga + Typesense.
// Astro talks to this — never to Odoo, never to Typesense.
// =============================================================================
//
// Endpoints exposed:
//   GET  /                   -> static Astro build (one container, prop sparsity demo)
//   POST /api/catalog/facets -> the interdependent filter query (the one in the cover letter)
//   POST /graphql            -> GraphQL Yoga playground (Christian's "GraphQL is a strict requirement")
//   GET  /healthz            -> health check
//
// =============================================================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createSchema, createYoga } from "graphql-yoga";

import { OdooClient } from "./sync/odoo-client.js";
import { makeTypesenseClient, syncOnce, COLLECTION } from "./sync/typesense-indexer.js";
import { CONTRACT_VERSION, LocaleSchema, resolveI18n } from "./contracts/product.js";
import { TENANTS } from "./tenants/martial-arts-ch.config.js";

const app = new Hono();
app.use("*", cors());

// -----------------------------------------------------------------------------
// Bootstrap: connect to Odoo (mock), index into Typesense, repeat every 60s.
// In production this would be Odoo write-hook + 1-min delta cron.
// -----------------------------------------------------------------------------
const odoo = new OdooClient({
  baseUrl: process.env.ODOO_URL || "https://odoo-tenant.example/jsonrpc",
  db: process.env.ODOO_DB || "martial-arts-demo",
  apiKey: process.env.ODOO_API_KEY || "demo-key",
});
const ts = makeTypesenseClient();
(async () => {
  try { await syncOnce(odoo, ts); } catch (e) { console.error("sync error:", e); }
  setInterval(() => syncOnce(odoo, ts).catch(e => console.error(e)), 60_000);
})();

// -----------------------------------------------------------------------------
// REST endpoint — the exact JSON-payload shape from the cover letter.
// -----------------------------------------------------------------------------
app.post("/api/catalog/facets", async (c) => {
  const body = await c.req.json();
  const shop = body.shop || "martial-arts-ch";
  const tenant = TENANTS[shop];
  if (!tenant) return c.json({ error: "unknown_shop" }, 404);

  const locale = LocaleSchema.parse(body.locale?.split("-")[0] || "de");
  const applied = body.applied_filters || {};

  // Compose Typesense filter_by from applied filters.
  const filters: string[] = [`in_stock:=true`];
  if (body.category_slug) filters.push(`category_slugs:=${body.category_slug}`);
  if (applied.brand?.length) filters.push(`brand:=[${applied.brand.map((b: string) => JSON.stringify(b)).join(",")}]`);
  if (applied.size?.length) filters.push(`size:=[${applied.size.join(",")}]`);
  if (applied.weight_oz?.length) filters.push(`weight_oz:=[${applied.weight_oz.join(",")}]`);
  if (applied.color?.length) filters.push(`color:=[${applied.color.join(",")}]`);

  const facetsRequested = (body.facets_requested || ["brand", "size", "weight_oz", "color"]).join(",");

  const r = await ts.collections(COLLECTION).documents().search({
    q: "*",
    query_by: "name_de,name_en",
    filter_by: filters.join(" && "),
    facet_by: facetsRequested,
    max_facet_values: 50,
    per_page: body.page_size || 24,
    page: body.page || 1,
  });

  const nameField = locale === "en" ? "name_en" : "name_de";

  const dto = {
    _contract: CONTRACT_VERSION,
    locale,
    currency: tenant.currency,
    total: r.found,
    products: (r.hits || []).map((h: any) => ({
      slug: h.document.slug,
      name: h.document[nameField] || h.document.name_de || "",
      price_chf: h.document.price_chf,
      img: h.document.image,
    })),
    facets: Object.fromEntries(
      (r.facet_counts || []).map((f: any) => [
        f.field_name,
        (f.counts || []).map((c: any) => ({ v: c.value, n: c.count })),
      ])
    ),
  };
  return c.json(dto);
});

// -----------------------------------------------------------------------------
// GraphQL endpoint — strict requirement per Christian's brief.
// -----------------------------------------------------------------------------
const yoga = createYoga({
  graphqlEndpoint: "/graphql",
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type FacetCount { v: String!  n: Int! }
      type ProductCard { slug: String!  name: String!  price_chf: Float!  img: String! }
      type Facets { brand: [FacetCount!]!  size: [FacetCount!]!  weight_oz: [FacetCount!]!  color: [FacetCount!]! }
      type CatalogResult {
        _contract: String!
        locale: String!
        currency: String!
        total: Int!
        products: [ProductCard!]!
        facets: Facets!
      }
      type Query {
        searchProducts(
          shop: String! = "martial-arts-ch",
          locale: String! = "de-CH",
          category_slug: String = "boxing-gloves",
          brand: [String!] = [],
          size: [String!] = [],
          weight_oz: [String!] = [],
          color: [String!] = []
        ): CatalogResult!
      }
    `,
    resolvers: {
      Query: {
        searchProducts: async (_p, args) => {
          const tenant = TENANTS[args.shop];
          if (!tenant) throw new Error("unknown_shop");
          const locale = LocaleSchema.parse((args.locale || "de").split("-")[0]);
          const filters: string[] = ["in_stock:=true"];
          if (args.category_slug) filters.push(`category_slugs:=${args.category_slug}`);
          if (args.brand?.length) filters.push(`brand:=[${args.brand.map((b: string) => JSON.stringify(b)).join(",")}]`);
          if (args.size?.length) filters.push(`size:=[${args.size.join(",")}]`);
          if (args.weight_oz?.length) filters.push(`weight_oz:=[${args.weight_oz.join(",")}]`);
          if (args.color?.length) filters.push(`color:=[${args.color.join(",")}]`);

          const r = await ts.collections(COLLECTION).documents().search({
            q: "*",
            query_by: "name_de,name_en",
            filter_by: filters.join(" && "),
            facet_by: "brand,size,weight_oz,color",
            max_facet_values: 50,
            per_page: 24,
          });

          const nameField = locale === "en" ? "name_en" : "name_de";
          const facetMap = Object.fromEntries(
            (r.facet_counts || []).map((f: any) => [
              f.field_name,
              (f.counts || []).map((c: any) => ({ v: c.value, n: c.count })),
            ])
          );
          return {
            _contract: CONTRACT_VERSION,
            locale,
            currency: tenant.currency,
            total: r.found,
            products: (r.hits || []).map((h: any) => ({
              slug: h.document.slug,
              name: h.document[nameField] || h.document.name_de || "",
              price_chf: h.document.price_chf,
              img: h.document.image,
            })),
            facets: {
              brand: facetMap.brand || [],
              size: facetMap.size || [],
              weight_oz: facetMap.weight_oz || [],
              color: facetMap.color || [],
            },
          };
        },
      },
    },
  }),
});
app.all("/graphql", async (c) => {
  const res = await yoga.fetch(c.req.raw);
  return res as any;
});

app.get("/healthz", (c) => c.json({ ok: true, contract: CONTRACT_VERSION }));

// Astro static build is served at /
app.use("/*", serveStatic({ root: "./web/dist" }));

const PORT = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`BFF listening on http://0.0.0.0:${info.port}`);
  console.log(`  GraphiQL: http://0.0.0.0:${info.port}/graphql`);
});
