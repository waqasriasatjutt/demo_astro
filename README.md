# Headless Odoo demo — BFF + Typesense + Astro

Live: **https://shop-demo.way4tech.com** &nbsp;·&nbsp; GraphiQL: **https://shop-demo.way4tech.com/graphql**

A small, working proof that the five framework rules of a strict headless Odoo build can be met simultaneously on one URL. Built to show, not to ship.

## What it does

One PLP page. Picks brand, narrows the size / weight / color facets in lock-step. All four sizes, three weights, three colors. The brands carry intentionally uneven inventory so the **interdependent** behaviour is visible: pick Hayabusa and XS disappears; pick Venum and red disappears; pick RDX and 12oz/16oz disappear.

## How each rule is honored

| Rule | Where to look in the repo |
|---|---|
| **1. BFF Law** — Astro never talks to Odoo | [`bff/server.ts`](bff/server.ts) is the only thing that touches Odoo. The Astro page in [`web/src/pages/index.astro`](web/src/pages/index.astro) fetches only `/api/catalog/facets` and `/graphql`. Open DevTools Network on the live site — there is no other origin. |
| **2. Data Contract** — versioned, multi-lang, validation states | [`bff/contracts/product.ts`](bff/contracts/product.ts) defines `Product@v1` as a Zod schema with `{de, fr, it, en}` translation fields, a `validation_state` enum, and an explicit fallback chain (requested locale → `de` → `en`). The contract version is pinned on every BFF response (`_contract: "Product@v1"`). |
| **3. Prop Sparsity** — islands receive only IDs | [`web/src/pages/index.astro`](web/src/pages/index.astro) passes only `{ shop, locale, category }` to the island. Full product JSON is fetched by the island itself from the BFF on hydration. Initial HTML payload stays tiny. |
| **4. Search Engine Offload** — Odoo not in the hot path | [`bff/sync/typesense-indexer.ts`](bff/sync/typesense-indexer.ts) normalises Odoo records against the contract, drops anything not `live`, and upserts into a Typesense collection. The BFF resolves filter queries against Typesense (`filter_by` + `facet_by`) — Odoo is contacted only by the sync cron, never by the storefront. |
| **5. Template Governance** — per-shop toggleable modules | [`bff/tenants/martial-arts-ch.config.ts`](bff/tenants/martial-arts-ch.config.ts) declares the modules enabled for this shop. A second tenant (`premium-watches-ch`) shows the same shape with different toggles. Adding a shop is one new file under `tenants/`. |

## Run locally

```bash
git clone https://github.com/waqasriasatjutt/martial-arts-headless-demo.git
cd martial-arts-headless-demo
docker compose up -d
# Astro PLP:  http://localhost:13000/
# GraphiQL:   http://localhost:13000/graphql
```

Open the GraphiQL playground and run:

```graphql
query {
  searchProducts(brand: ["Hayabusa"]) {
    _contract
    locale
    currency
    total
    products { slug name price_chf img }
    facets {
      brand     { v n }
      size      { v n }
      weight_oz { v n }
      color     { v n }
    }
  }
}
```

Watch the response shrink to only the Hayabusa rows + a narrowed facet set (no XS, only black/red, etc.).

## Architecture (one container, one URL)

```
   ┌─────────────────────────────────────────────────────────────────┐
   │  Browser (Astro)                                                │
   │  ───────────────                                                │
   │  Server island receives ONLY {shop, locale, category} as props  │
   │  → fetches /api/catalog/facets and /graphql                     │
   └──────────────────────┬──────────────────────────────────────────┘
                          │ (only this one origin)
                          ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  BFF (Hono + GraphQL Yoga + Zod)                                │
   │   - /api/catalog/facets        (REST, exact shape from cover letter)
   │   - /graphql                   (GraphQL Yoga, persisted queries) │
   │   - validates inputs/outputs against Product@v1                 │
   │   - composes schema per tenant (Template Governance)            │
   └──────┬────────────────────────────────────────────────┬─────────┘
          │                                                │
          ▼                                                ▼
   ┌────────────────┐                            ┌────────────────────┐
   │  Typesense     │  ◀── (delta-sync 1/min)    │  Odoo 19           │
   │  (search +     │                            │  /jsonrpc          │
   │  facets, in CH)│                            │  (out of hot path) │
   └────────────────┘                            └────────────────────┘
```

The customer click path stops at Typesense. Odoo only sees the sync cron.

## Not in scope for this demo

- Cart persistence, JWT auth, checkout, `sale.order` push back — proves rules, not commerce. A paid 2-day POC against a real Odoo instance adds these.
- FR / IT translations — wired in the contract but seeded only DE + EN here.
- PDP and variant matrix — same reason.

## Author

Waqas Riasat — `waqasriasatjutt@gmail.com`
