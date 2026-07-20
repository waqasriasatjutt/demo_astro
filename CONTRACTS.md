# API Contracts - Headless Odoo 19 (v1)

Concepts-first. These are the versioned contracts the whole stack builds to:
**Ashvin's** Odoo output maps *into* them, **Zuanda's** Astro islands consume them,
the BFF owns them. Redline anything here before we build against it.

Conventions on every payload:
- `_contract` tag pins the version (`Product@v1`, `Variant@v1`, …) so drift fails loud.
- i18n fields are `{ de, fr, it, en }`, resolved **requested → de → en** in the BFF; the UI receives a plain string.
- `validation_state` (`draft` / `needs_translation` / `publishable` / `live`) - **only `live` is exposed** to the storefront.
- Rule 3 (Prop Sparsity): islands get **IDs only**; everything else is fetched on hydration.
- Rule 4 (Search Offload): listing + faceting come from **Typesense**, never Odoo on the customer click.

## The contracts

| Contract | Projects from Odoo | Key fields |
|---|---|---|
| **Product@v1** | `product.template` | slug, brand, i18n name/description, `price_from_chf`, category_slugs, listing `availability` |
| **Variant@v1** | `product.product` + stock | `variant_id`, `sku`, `attributes{}`, `price_chf`, **`stock{ free_qty, availability }`** |
| **Category@v1** | e-commerce category tree | slug, parent, breadcrumb `path`, i18n name, `facet_keys` |
| **Customer@v1** | `res.partner` (+ `res.users` login) | `partner_id`, email, display_name, locale, addresses; **JWT claims** (BFF-issued, RS256) |
| **Cart@v1** | draft `sale.order` | `cart_token`, `order_id`, `state`, lines, subtotal/tax/total; **merge algorithm** |
| **Order@v1** | `sale.order` | `order_id`, name, state, `created_via:"bff-jwt"`; + the exact `/jsonrpc` create payload |
| **Error@v1** | Odoo exceptions | closed `code` set → `extensions.code` + i18n `user_message` |

Files: contracts in [`bff/contracts/*.ts`](bff/contracts), GraphQL SDL in [`bff/schema/contracts.graphql`](bff/schema/contracts.graphql), mock payloads in [`samples/`](samples).

## Stock model (per Ashvin's request)

Per **variant**, one derivation rule so nobody computes it twice:
- `free_qty` - Odoo `product.product.free_qty` (on-hand − reserved).
- `availability` - `out_of_stock` when `free_qty ≤ 0` **and** not sold-at-zero; `low_stock` at/below the threshold; else `in_stock`.
- The exact number is only surfaced to the UI when `low_stock` ("only 3 left"); we don't leak full inventory to the browser.
- Snapshot into Typesense for the listing card; read **live** on the PDP and at add-to-cart; **hard check at checkout** → maps to `CART_STOCK_INSUFFICIENT`.

That gives Zuanda the three states directly: **in-stock**, **low ("only N left")**, **out-of-stock (disabled + badge)**.

## Phase 1 flows these enable

1. **Auth & cart** - `login` issues the JWT and (first `addToCart`) creates a draft `sale.order` via `/jsonrpc`.
2. **Guest merge** - `mergeGuestCart` (also inside `login`) re-homes the guest cart to the partner; the surviving `cart_token` is returned.
3. **Error taxonomy** - every failure carries `extensions.code` from the closed set + a translated `user_message`.

## What each teammate needs

- **Ashvin (Odoo):** confirm the field sources above, esp. `free_qty` exposure per variant and the customer auth model (`res.users` login vs `res.partner` + token) for the JWT→partner mapping. Staging still needs **Sales + Inventory** installed and a few variant products seeded - details in my DM.
- **Zuanda (Astro):** build against [`samples/product.sample.json`](samples/product.sample.json) + [`samples/cart.sample.json`](samples/cart.sample.json). Islands take `variant_id` only. Error shape in [`samples/error.sample.json`](samples/error.sample.json).

## Open for redline

- Attribute value **slugs vs labels** in `attributes{}` (I've used value slugs; labels resolve via i18n).
- Cart identity: `cart_token` as the stable key vs `sale.order.id` directly.
- Whether B2B **pricelist** tiers land in Phase 1 or defer to Phase 4.
