// =============================================================================
// Customer@v1 - Data Contract Rule (Rule 2)
// =============================================================================
// The customer identity the storefront sees. It is a PROJECTION of Odoo
// res.partner (+ the res.users login), never the raw Odoo record. The BFF owns
// the JWT; Odoo never issues or validates tokens.
//
// Auth model (Phase 1): the BFF authenticates once against Odoo res.users, then
// issues its own stateless JWT (RS256, jose). The token carries partner_id so
// every downstream call resolves to a res.partner without a second round-trip.
// =============================================================================

import { z } from "zod";
import { LocaleSchema, ValidationState } from "./product.js";

export const CONTRACT_VERSION = "Customer@v1";

// A sparse projection of a res.partner child address (type invoice / delivery).
export const AddressSchema = z.object({
  id: z.number().int(),                 // res.partner id (child address)
  kind: z.enum(["billing", "delivery"]),
  name: z.string(),
  street: z.string(),
  street2: z.string().optional(),
  zip: z.string(),
  city: z.string(),
  country_code: z.string().length(2),   // ISO-3166-1 alpha-2
  is_default: z.boolean().default(false),
});
export type Address = z.infer<typeof AddressSchema>;

export const CustomerSchema = z.object({
  _contract: z.literal(CONTRACT_VERSION),
  partner_id: z.number().int(),         // res.partner id - the canonical customer key
  email: z.string().email(),
  display_name: z.string(),
  locale: LocaleSchema,                 // preferred locale, drives i18n resolution
  addresses: z.array(AddressSchema).default([]),
  validation_state: ValidationState,
});
export type Customer = z.infer<typeof CustomerSchema>;

// --- JWT claims (stateless). BFF-issued, RS256. NOT an Odoo session. ----------
export const JwtScope = z.enum(["shop:read", "cart:write", "order:write"]);

export const JwtClaimsSchema = z.object({
  iss: z.literal("bff.headless"),
  sub: z.string(),                      // stringified partner_id
  email: z.string().email(),
  name: z.string(),
  locale: LocaleSchema,
  scope: z.array(JwtScope).default(["shop:read", "cart:write"]),
  cart_token: z.string().uuid().optional(), // guest cart carried through login for merge
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().uuid(),
});
export type JwtClaims = z.infer<typeof JwtClaimsSchema>;

// Prop Sparsity (Rule 3): islands receive partner_id only; everything else is
// fetched from the BFF on hydration behind the JWT.
export function toStorefrontIdentity(c: Customer) {
  return { partner_id: c.partner_id, display_name: c.display_name, locale: c.locale };
}
