# Phase 1 BFF

Auth & cart lifecycle, guest-cart merge, and the Odoo→GraphQL error taxonomy -
wired to Odoo 19 over JSON-RPC. GraphiQL at `/graphql`.

## Run

Connection comes from env (nothing sensitive is committed):

```
ODOO_URL=https://your-odoo ODOO_DB=your_db ODOO_LOGIN=user ODOO_PASSWORD=secret node server.mjs
```

or Docker:

```
docker build -t phase1-bff .
docker run -p 3000:3000 -e ODOO_URL=... -e ODOO_DB=... -e ODOO_LOGIN=... -e ODOO_PASSWORD=... phase1-bff
```

## Flows

- `addToCart(variant_id, qty, cart_token?)` - first add creates a draft `sale.order`
  in Odoo via `/jsonrpc`. Stock-guarded against live `free_qty`.
- `login(email, guest_cart_token?)` - issues a stateless RS256 JWT and folds a guest
  cart into the partner's cart.
- `mergeGuestCart(guest_cart_token)` - explicit guest→partner merge (requires the JWT
  in `Authorization: Bearer …`).

Every error carries `extensions.code` from the closed `Error@v1` set plus an i18n
`user_message`. A cart is a projection of a draft `sale.order` - no parallel store.

Contracts these implement live in [`../bff/contracts/`](../bff/contracts).
