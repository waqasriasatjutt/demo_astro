# Phase 1 BFF - complete endpoint reference

Read this if you're used to REST. GraphQL uses **one URL** and you choose the operation
in the request body. Every call below is the same HTTP shape:

```
POST https://poc.way4tech.com/graphql
Content-Type: application/json

{ "query": "<the operation>", "variables": { ... } }
```

- Always **POST**, always JSON, always this one URL.
- `variables` is where your dynamic values go (a product id, an email, a token).
- For calls that act as a logged-in customer, add a header: `Authorization: Bearer <token>` (the `token` from `login`).
- The response is always `{ "data": { ... } }`, or `{ "errors": [ ... ] }` on failure.

---

## PRODUCTS

### 1. List products + live stock
**POST** `/graphql`
```json
{ "query": "{ products { variant_id sku name price_chf free_qty availability } }" }
```
**Response**
```json
{ "data": { "products": [
  { "variant_id": 3, "sku": "HYB-T3-L-BLA", "name": "[HYB-T3-L-BLA] Hayabusa T3 Boxing Gloves (Black, L)", "price_chf": 189, "free_qty": 12, "availability": "in_stock" },
  { "variant_id": 4, "sku": "HYB-T3-L-RED", "name": "[HYB-T3-L-RED] Hayabusa T3 Boxing Gloves (Red, L)",   "price_chf": 189, "free_qty": 0,  "availability": "out_of_stock" },
  { "variant_id": 1, "sku": "HYB-T3-M-BLA", "name": "[HYB-T3-M-BLA] Hayabusa T3 Boxing Gloves (Black, M)", "price_chf": 189, "free_qty": 3,  "availability": "low_stock" },
  { "variant_id": 2, "sku": "HYB-T3-M-RED", "name": "[HYB-T3-M-RED] Hayabusa T3 Boxing Gloves (Red, M)",   "price_chf": 189, "free_qty": 15, "availability": "in_stock" }
] } }
```

### 2. One product with its variants
```json
{ "query": "query($n:String!){ product(name:$n){ name variant_axes variants{ variant_id sku price_chf availability } } }",
  "variables": { "n": "Hayabusa T3 Boxing Gloves" } }
```
**Response**
```json
{ "data": { "product": {
  "name": "Hayabusa T3 Boxing Gloves",
  "variant_axes": ["size", "color"],
  "variants": [ { "variant_id": 3, "sku": "HYB-T3-L-BLA", "price_chf": 189, "availability": "in_stock" }, ... ]
} } }
```

---

## CART

### 3. Add to cart  (first add creates a draft `sale.order` in Odoo)
```json
{ "query": "mutation($v:Int!,$q:Float){ addToCart(variant_id:$v, qty:$q){ cart_token order_id state currency subtotal_chf tax_chf total_chf lines{ line_id variant_id name qty unit_price_chf subtotal_chf } } }",
  "variables": { "v": 2, "q": 1 } }
```
Pass `cart_token` too (in variables) to add to an existing cart; leave it out to start a new one.
**Response**
```json
{ "data": { "addToCart": {
  "cart_token": "cart_564474b7", "order_id": 4, "state": "guest", "currency": "CHF",
  "subtotal_chf": 189, "tax_chf": 15.31, "total_chf": 204.31,
  "lines": [ { "line_id": 5, "variant_id": 2, "name": "[HYB-T3-M-RED] Hayabusa T3 Boxing Gloves (Red, M)", "qty": 1, "unit_price_chf": 189, "subtotal_chf": 189 } ]
} } }
```

### 4. Read a cart by its token
```json
{ "query": "query($c:String!){ cart(cart_token:$c){ cart_token order_id state total_chf lines{ name qty } } }",
  "variables": { "c": "cart_564474b7" } }
```
**Response**
```json
{ "data": { "cart": { "cart_token": "cart_564474b7", "order_id": 4, "state": "guest", "total_chf": 204.31, "lines": [ { "name": "[HYB-T3-M-RED] Hayabusa T3 Boxing Gloves (Red, M)", "qty": 1 } ] } } }
```

---

## AUTH

### 5. Login  (issues a JWT; merges a guest cart if you pass its token)
```json
{ "query": "mutation($e:String!,$g:String){ login(email:$e, guest_cart_token:$g){ token partner_id display_name cart{ state total_chf lines{ name qty } } } }",
  "variables": { "e": "buyer@example.com", "g": "cart_564474b7" } }
```
**Response** - `cart.state` becomes `active`, the guest cart carried over. `token` is the JWT (use it in the `Authorization` header on later calls).
```json
{ "data": { "login": {
  "token": "eyJhbGciOiJSUzI1NiJ9.eyJ...",
  "partner_id": 11, "display_name": "buyer",
  "cart": { "state": "active", "total_chf": 204.31, "lines": [ { "name": "[HYB-T3-M-RED] Hayabusa T3 Boxing Gloves (Red, M)", "qty": 1 } ] }
} } }
```

### 6. Merge a guest cart into the logged-in customer  (needs the JWT)
**POST** `/graphql` with header `Authorization: Bearer <token>`
```json
{ "query": "mutation($g:String!){ mergeGuestCart(guest_cart_token:$g){ state total_chf lines{ name qty } } }",
  "variables": { "g": "cart_4539bbc0" } }
```
**Response**
```json
{ "data": { "mergeGuestCart": { "state": "active", "total_chf": 408.62, "lines": [ { "name": "...(Red, M)", "qty": 1 }, { "name": "...(Black, L)", "qty": 1 } ] } } }
```

---

## ERRORS

Any failure returns `errors[]` instead of `data`. Example - adding 5 of an out-of-stock variant:
```json
{ "query": "mutation($v:Int!){ addToCart(variant_id:$v, qty:5){ cart_token } }", "variables": { "v": 4 } }
```
**Response**
```json
{ "errors": [ {
  "message": "Not enough stock for this item.",
  "path": ["addToCart"],
  "extensions": {
    "code": "CART_STOCK_INSUFFICIENT", "category": "conflict", "retryable": false, "http_status": 409,
    "user_message": { "de": "Nicht genügend Lagerbestand für diesen Artikel.", "fr": "Stock insuffisant pour cet article.", "it": "Scorte insufficienti per questo articolo.", "en": "Not enough stock for this item." }
  }
} ], "data": null }
```
The frontend switches on `extensions.code` and shows `extensions.user_message[locale]`.

---

## Copy-paste curl (proves it with no tools)

```bash
curl -X POST https://poc.way4tech.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ products { variant_id sku availability price_chf } }"}'
```

## Summary - all operations

| # | Operation | Type | Auth | Purpose |
|---|---|---|---|---|
| 1 | `products` | query | no | catalog + stock |
| 2 | `product(name)` | query | no | one product + variants |
| 3 | `addToCart(variant_id, qty, cart_token?)` | mutation | optional | add → draft order |
| 4 | `cart(cart_token)` | query | no | read a cart |
| 5 | `login(email, guest_cart_token?)` | mutation | no | JWT + merge |
| 6 | `mergeGuestCart(guest_cart_token)` | mutation | **yes** | explicit merge |
