// =============================================================================
// Cart@v1 — Data Contract Rule (Rule 2)
// =============================================================================
// A cart IS a draft sale.order in Odoo. The BFF does not keep a parallel cart
// store — it projects the draft order so there is one source of truth. A guest
// cart is a draft sale.order on the public partner + an opaque cart_token; on
// login it is re-homed to the authenticated partner (the merge, deliverable #2).
// =============================================================================

import { z } from "zod";
import { LocaleSchema } from "./product.js";
import { Availability } from "./variant.js";

export const CONTRACT_VERSION = "Cart@v1";

export const CartState = z.enum([
  "guest",      // draft sale.order on the public partner, keyed by cart_token
  "active",     // draft sale.order on an authenticated partner
  "merged",     // guest cart absorbed into an active cart (terminal for the guest one)
  "converted",  // sale.order confirmed -> becomes an Order (Phase 4)
]);

export const CartLineSchema = z.object({
  line_id: z.number().int(),            // sale.order.line id
  variant_id: z.number().int(),         // product.product id (Rule 3)
  sku: z.string(),
  name: z.string(),                     // resolved to the cart locale server-side
  qty: z.number().int().positive(),
  unit_price_chf: z.number().nonnegative(),
  subtotal_chf: z.number().nonnegative(),
  availability: Availability,           // re-checked at read; drives the stock error case
});
export type CartLine = z.infer<typeof CartLineSchema>;

export const CartSchema = z.object({
  _contract: z.literal(CONTRACT_VERSION),
  cart_token: z.string().uuid(),        // opaque, stable across guest -> auth
  order_id: z.number().int().nullable(), // draft sale.order id (null until first add)
  partner_id: z.number().int().nullable(), // null while guest (public partner)
  state: CartState,
  locale: LocaleSchema,
  currency: z.literal("CHF"),
  lines: z.array(CartLineSchema).default([]),
  subtotal_chf: z.number().nonnegative().default(0),
  tax_chf: z.number().nonnegative().default(0),
  total_chf: z.number().nonnegative().default(0),
});
export type Cart = z.infer<typeof CartSchema>;

// --- Merge algorithm (Phase 1 deliverable #2), documented as a contract ------
// On the login mutation, given a guest cart_token G and the authenticated
// partner P:
//   1. Load the draft sale.order for G (currently on the public partner).
//   2. Load P's existing active draft sale.order A (if any).
//   3. No A  -> reassign G.partner_id = P; G becomes `active`. Done.
//   4. A exists -> for each line in G, upsert into A by variant_id (sum qty),
//        re-validate stock per merged line, mark G `merged`, archive it.
//        A wins (keeps P's pricelist).
//   5. Re-price A against P's pricelist (a B2B partner may have a tier).
// The cart_token returned after login is ALWAYS the surviving cart's token.
export const MergeResultSchema = z.object({
  _contract: z.literal(CONTRACT_VERSION),
  surviving_cart_token: z.string().uuid(),
  merged_line_count: z.number().int().nonnegative(),
  repriced: z.boolean(),
  cart: CartSchema,
});
export type MergeResult = z.infer<typeof MergeResultSchema>;
