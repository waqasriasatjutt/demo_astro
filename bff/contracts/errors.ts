// =============================================================================
// Error@v1 - Error Taxonomy (Phase 1 deliverable #3)
// =============================================================================
// Native Odoo exceptions are unstructured strings meant for the Odoo web client.
// The BFF translates them into a CLOSED set of machine-readable GraphQL error
// codes, surfaced under `extensions` so Astro branches on `code` and never
// parses a message. This boundary keeps Odoo internals out of the UI.
// =============================================================================

import { z } from "zod";

export const CONTRACT_VERSION = "Error@v1";

// Closed set - the frontend switches on these; adding one is a version bump.
export const ErrorCode = z.enum([
  // auth
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_TOKEN_EXPIRED",
  "AUTH_TOKEN_INVALID",
  // cart / stock  (the seed case Christian named = CART_STOCK_INSUFFICIENT)
  "CART_STOCK_INSUFFICIENT",
  "CART_VARIANT_UNAVAILABLE",
  "CART_EMPTY",
  // validation
  "VALIDATION_REQUIRED_FIELD",
  "VALIDATION_CONSTRAINT",
  // pricing
  "PRICELIST_MISMATCH",
  "COUPON_INVALID",
  // partner
  "PARTNER_BLOCKED",
  // infra / upstream
  "ODOO_ACCESS_DENIED",
  "ODOO_UNAVAILABLE",
  "RATE_LIMITED",
  "INTERNAL",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorCategory = z.enum(["auth", "validation", "conflict", "upstream", "internal"]);
export type ErrorCategory = z.infer<typeof ErrorCategory>;

const I18nMessage = z.object({
  de: z.string(),
  fr: z.string(),
  it: z.string(),
  en: z.string(),
});

// The extensions block attached to every GraphQL error the BFF emits.
export const ErrorExtensionsSchema = z.object({
  code: ErrorCode,
  category: ErrorCategory,
  retryable: z.boolean(),
  http_status: z.number().int(),        // advisory for REST callers / CDN
  odoo_origin: z.string().nullable(),   // Odoo exception class, for OUR logs (never shown to users)
  user_message: I18nMessage,            // safe, translated, UI-ready
  ref: z.string().optional(),           // correlation id for support
});
export type ErrorExtensions = z.infer<typeof ErrorExtensionsSchema>;

// --- THE MAP: Odoo exception -> structured code (the sample schema map). ------
// `match` discriminates on the fault string; first match wins; default INTERNAL.
export interface OdooErrorRule {
  odoo_class: string;
  match?: RegExp;
  code: ErrorCode;
  category: ErrorCategory;
  retryable: boolean;
  http_status: number;
  user_message: z.infer<typeof I18nMessage>;
}

export const ODOO_ERROR_MAP: OdooErrorRule[] = [
  {
    odoo_class: "odoo.exceptions.ValidationError",
    match: /not enough (stock|inventory)|insufficient|available.*qty|out of stock/i,
    code: "CART_STOCK_INSUFFICIENT", category: "conflict", retryable: false, http_status: 409,
    user_message: {
      de: "Nicht genügend Lagerbestand für diesen Artikel.",
      fr: "Stock insuffisant pour cet article.",
      it: "Scorte insufficienti per questo articolo.",
      en: "Not enough stock for this item.",
    },
  },
  {
    odoo_class: "odoo.exceptions.UserError",
    match: /archived|no longer available|inactive variant/i,
    code: "CART_VARIANT_UNAVAILABLE", category: "conflict", retryable: false, http_status: 409,
    user_message: {
      de: "Diese Variante ist nicht mehr verfügbar.",
      fr: "Cette variante n'est plus disponible.",
      it: "Questa variante non è più disponibile.",
      en: "This variant is no longer available.",
    },
  },
  {
    odoo_class: "odoo.exceptions.ValidationError",
    match: /required|missing|mandatory/i,
    code: "VALIDATION_REQUIRED_FIELD", category: "validation", retryable: false, http_status: 422,
    user_message: {
      de: "Bitte füllen Sie die Pflichtfelder aus.",
      fr: "Veuillez remplir les champs obligatoires.",
      it: "Compilare i campi obbligatori.",
      en: "Please complete the required fields.",
    },
  },
  {
    odoo_class: "odoo.exceptions.AccessError",
    code: "ODOO_ACCESS_DENIED", category: "upstream", retryable: false, http_status: 502,
    user_message: {
      de: "Dienst vorübergehend nicht verfügbar.",
      fr: "Service temporairement indisponible.",
      it: "Servizio temporaneamente non disponibile.",
      en: "Service temporarily unavailable.",
    },
  },
];

// Never leak an unmapped Odoo string to the client.
export const DEFAULT_ERROR: Omit<ErrorExtensions, "odoo_origin" | "ref"> = {
  code: "INTERNAL", category: "internal", retryable: false, http_status: 500,
  user_message: {
    de: "Ein unerwarteter Fehler ist aufgetreten.",
    fr: "Une erreur inattendue s'est produite.",
    it: "Si è verificato un errore imprevisto.",
    en: "An unexpected error occurred.",
  },
};

/** Map a raw Odoo fault into the structured extensions block. */
export function mapOdooError(odooClass: string, message: string): Omit<ErrorExtensions, "ref"> {
  const rule = ODOO_ERROR_MAP.find(
    (r) => r.odoo_class === odooClass && (!r.match || r.match.test(message)),
  );
  if (!rule) return { ...DEFAULT_ERROR, odoo_origin: odooClass };
  return {
    code: rule.code,
    category: rule.category,
    retryable: rule.retryable,
    http_status: rule.http_status,
    user_message: rule.user_message,
    odoo_origin: odooClass,
  };
}
