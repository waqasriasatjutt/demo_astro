// =============================================================================
// Order@v1 - Data Contract Rule (Rule 2)
// =============================================================================
// The draft sale.order created in Odoo via /jsonrpc the moment a JWT-bearing
// session first adds to cart (Phase 1 deliverable #1). Order@v1 is the read
// projection; DraftOrderCreatePayload is the exact write the BFF sends Odoo, so
// Ashvin knows precisely which fields we touch.
// =============================================================================

import { z } from "zod";
import { CartLineSchema } from "./cart.js";

export const CONTRACT_VERSION = "Order@v1";

export const OrderState = z.enum(["draft", "sent", "sale", "cancel"]);

export const OrderSchema = z.object({
  _contract: z.literal(CONTRACT_VERSION),
  order_id: z.number().int(),           // sale.order id
  name: z.string(),                     // SO reference, e.g. "S00042"
  partner_id: z.number().int(),
  state: OrderState,                    // Phase 1 stops at `draft`
  cart_token: z.string().uuid(),        // links the order back to its cart lineage
  created_via: z.literal("bff-jwt"),    // provenance stamp -> auditable in Odoo
  currency: z.literal("CHF"),
  lines: z.array(CartLineSchema).default([]),
  amount_untaxed_chf: z.number().nonnegative(),
  amount_tax_chf: z.number().nonnegative(),
  amount_total_chf: z.number().nonnegative(),
});
export type Order = z.infer<typeof OrderSchema>;

// The exact /jsonrpc create payload. client_order_ref = cart_token makes the
// create idempotent: the BFF looks up an existing draft by ref before creating.
export const DraftOrderCreatePayload = z.object({
  partner_id: z.number().int(),
  state: z.literal("draft"),
  client_order_ref: z.string(),
  order_line: z.array(
    z.tuple([
      z.literal(0),
      z.literal(0),
      z.object({
        product_id: z.number().int(),        // product.product id
        product_uom_qty: z.number().positive(),
      }),
    ]),
  ),
});
export type DraftOrderCreatePayload = z.infer<typeof DraftOrderCreatePayload>;
