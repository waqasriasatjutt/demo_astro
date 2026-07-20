# BFF API reference (Phase 1)

**One endpoint:** `POST https://poc.way4tech.com/graphql` with body `{ "query": "...", "variables": {...} }`.
**Live, always-current docs:** open the URL and click **Docs** (top-right) - GraphQL introspects itself.
**Auth:** send `Authorization: Bearer <token>` (from `login`) for calls that act as the customer.

There is no list of URLs - you pick the operation in the request body. Below is every operation.

## Queries

### `products` → `[Variant!]!`
Catalog with live stock. No arguments.
```graphql
{ products { variant_id sku name price_chf free_qty availability } }
```

### `product(name: String!)` → `ProductDetail!`
One product with its variants.
```graphql
{ product(name: "Hayabusa T3 Boxing Gloves") {
  name variant_axes
  variants { variant_id sku price_chf availability free_qty }
} }
```

### `cart(cart_token: String!)` → `Cart`
Read a cart by its token.
```graphql
{ cart(cart_token: "cart_xxxx") { state total_chf lines { name qty } } }
```

## Mutations

### `addToCart(variant_id: Int!, qty: Float = 1, cart_token: String)` → `Cart!`
Adds a variant. First add (no `cart_token`) starts a guest cart = a draft `sale.order` in Odoo. Stock-guarded.
```graphql
mutation { addToCart(variant_id: 2, qty: 1) {
  cart_token order_id state total_chf lines { name qty unit_price_chf }
} }
```

### `login(email: String!, password: String = "demo", guest_cart_token: String)` → `Session!`
Issues a JWT; if `guest_cart_token` is passed, merges that cart into the customer.
```graphql
mutation { login(email: "buyer@example.com", guest_cart_token: "cart_xxxx") {
  token partner_id display_name cart { state total_chf lines { name qty } }
} }
```

### `mergeGuestCart(guest_cart_token: String!)` → `Cart!`
Explicit guest→customer merge. Requires `Authorization: Bearer <token>`.
```graphql
mutation { mergeGuestCart(guest_cart_token: "cart_xxxx") { state total_chf lines { name qty } } }
```

## Types

| Type | Fields |
|---|---|
| **Variant** | `variant_id:Int`, `sku:String`, `name:String`, `price_chf:Float`, `free_qty:Float`, `availability:String` (`in_stock`\|`low_stock`\|`out_of_stock`) |
| **ProductDetail** | `name:String`, `variant_axes:[String]`, `variants:[Variant]` |
| **CartLine** | `line_id:Int`, `variant_id:Int`, `name:String`, `qty:Float`, `unit_price_chf:Float`, `subtotal_chf:Float` |
| **Cart** | `cart_token:String`, `order_id:Int`, `partner_id:Int`, `state:String` (`guest`\|`active`\|`merged`\|`converted`), `currency:String`, `lines:[CartLine]`, `subtotal_chf/tax_chf/total_chf:Float` |
| **Session** | `token:String` (JWT), `partner_id:Int`, `display_name:String`, `cart:Cart` |

## Errors
Failures come back in the standard GraphQL `errors[]` array with `extensions.code` from a fixed set
(`CART_STOCK_INSUFFICIENT`, `CART_VARIANT_UNAVAILABLE`, `AUTH_TOKEN_INVALID`, `ODOO_ACCESS_DENIED`, `INTERNAL`, …)
plus `extensions.user_message { de, fr, it, en }`. The frontend switches on `code`, never on the text.
