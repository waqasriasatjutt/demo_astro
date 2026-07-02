// =============================================================================
// Data Contract Rule (Rule 2)
// =============================================================================
// Every entity has a versioned schema. The version is pinned in the response
// envelope so the frontend can reject drift loudly instead of silently rendering
// stale fields.
//
// Multi-lang fields are { de, fr, it, en } records. The BFF resolves them with
// an explicit fallback chain: requested locale -> de -> en. Incomplete records
// never reach the storefront because of `validation_state`.
// =============================================================================

import { z } from "zod";

export const CONTRACT_VERSION = "Product@v1";

export const LocaleSchema = z.enum(["de", "fr", "it", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const I18nString = z.object({
  de: z.string().optional(),
  fr: z.string().optional(),
  it: z.string().optional(),
  en: z.string().optional(),
});
export type I18nString = z.infer<typeof I18nString>;

export const ValidationState = z.enum([
  "draft",            // record exists but is incomplete
  "needs_translation",
  "publishable",
  "live",             // only `live` records are exposed to the storefront
]);

export const ProductSchema = z.object({
  _contract: z.literal(CONTRACT_VERSION),
  slug: z.string(),
  sku: z.string(),
  brand: z.string(),
  category_slugs: z.array(z.string()),
  attributes: z.object({
    size: z.enum(["S", "M", "L", "XL"]),
    weight_oz: z.enum(["12oz", "14oz", "16oz"]),
    color: z.enum(["black", "red", "white"]),
  }),
  in_stock: z.boolean(),
  price_chf: z.number().positive(),
  name: I18nString,
  description: I18nString,
  image: z.string().url(),
  validation_state: ValidationState,
});
export type Product = z.infer<typeof ProductSchema>;

/**
 * Resolve a multi-lang field with explicit fallback chain.
 * The fallback chain is part of the contract — not the frontend's problem.
 */
export function resolveI18n(field: I18nString, locale: Locale): string {
  return field[locale] || field.de || field.en || "";
}

/**
 * Strip an internal Product to a tight, sparse DTO ready for the storefront.
 * No internal flags, no version key, no internal IDs — only what the island
 * needs to render. This is what enforces Rule 3 (Prop Sparsity) on the
 * server side: the DTO is small by construction, not by frontend discipline.
 */
export function toStorefrontDTO(p: Product, locale: Locale) {
  return {
    slug: p.slug,
    name: resolveI18n(p.name, locale),
    price_chf: p.price_chf,
    img: p.image,
  };
}
