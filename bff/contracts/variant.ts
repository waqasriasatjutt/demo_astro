// =============================================================================
// Variant@v1 - Data Contract Rule (Rule 2)
// =============================================================================
// product.product level: the exact SKU a customer buys. Carries attributes,
// the live (pricelist-resolved) price, and per-variant STOCK. Product@v1 is the
// listing card (template); Variant@v1 is what the PDP variant selector and
// add-to-cart resolve against.
//
// Stock is Ashvin's requirement, expressed as a contract so all three layers
// agree on ONE availability rule - Astro never computes it, Odoo owns the
// numbers, the BFF derives the state.
// =============================================================================

import { z } from "zod";
import { LocaleSchema, I18nString, ValidationState, type Locale } from "./product.js";

export const CONTRACT_VERSION = "Variant@v1";

// The three states the storefront renders (Zuanda's variant selector).
export const Availability = z.enum(["in_stock", "low_stock", "out_of_stock"]);
export type Availability = z.infer<typeof Availability>;

export const StockSchema = z.object({
  free_qty: z.number(),                 // Odoo product.product.free_qty (on-hand - reserved)
  availability: Availability,           // DERIVED, see deriveAvailability - single source of truth
  low_stock_threshold: z.number().int().nonnegative().default(5),
  continue_selling: z.boolean().default(false), // Odoo "allow out-of-stock order" / sell at 0
});
export type Stock = z.infer<typeof StockSchema>;

export const VariantSchema = z.object({
  _contract: z.literal(CONTRACT_VERSION),
  variant_id: z.number().int(),         // product.product id  (Rule 3: this id is what islands get)
  template_id: z.number().int(),        // product.template id
  sku: z.string(),
  // value slugs keyed by attribute slug, e.g. { size: "L", weight_oz: "16oz", color: "black" }
  attributes: z.record(z.string()),
  price_chf: z.number().nonnegative(),  // live price, pricelist-resolved server-side
  compare_at_chf: z.number().nonnegative().optional(),
  stock: StockSchema,
  name: I18nString,
  validation_state: ValidationState,    // only `live` variants are exposed
});
export type Variant = z.infer<typeof VariantSchema>;

/**
 * The ONE way availability is derived. Odoo gives free_qty; this decides state.
 * out_of_stock only when there's no stock AND the product isn't sold-at-zero.
 */
export function deriveAvailability(
  free_qty: number,
  low_stock_threshold: number,
  continue_selling: boolean,
): Availability {
  if (free_qty <= 0) return continue_selling ? "in_stock" : "out_of_stock";
  if (free_qty <= low_stock_threshold) return "low_stock";
  return "in_stock";
}

/**
 * Prop Sparsity (Rule 3): the island gets id + price + availability. The raw
 * free_qty number is only surfaced when low (so the UI can say "only 3 left"),
 * never otherwise - we don't leak exact inventory to the browser.
 */
export function toStorefrontVariant(v: Variant, _locale: Locale) {
  return {
    variant_id: v.variant_id,
    price_chf: v.price_chf,
    availability: v.stock.availability,
    remaining: v.stock.availability === "low_stock" ? v.stock.free_qty : null,
  };
}

export { LocaleSchema };
