// =============================================================================
// Template Governance (Rule 5)
// =============================================================================
// Each shop in the multi-shop network has its own config file. The BFF reads
// this at boot, only loads the listed modules, and the GraphQL schema is
// composed from `core/*` + the enabled `modules/<shop>/*`. Feature flags here
// drive both backend schema stitching AND frontend conditional rendering —
// a disabled module ships zero JS to that shop.
//
// To add a new shop: create another file under tenants/ and a few modules
// under modules/<shop>/. The core never knows about shop-specific behaviour.
// =============================================================================

export type TenantConfig = {
  id: string;                          // "martial-arts-ch"
  primary_locale: "de" | "fr" | "it" | "en";
  supported_locales: Array<"de" | "fr" | "it" | "en">;
  currency: "CHF" | "EUR";
  search_collection: string;           // Typesense collection name
  modules: {
    /** core commerce — always on */
    catalog: true;
    /** martial arts: weight-class filter UI module — toggleable per shop */
    weight_class_filter: boolean;
    /** premium niche brands: warranty extension service — off by default */
    warranty_extension: boolean;
    /** Swiss compliance: VAT-aware pricing display */
    swiss_vat_display: boolean;
  };
};

export const martialArtsCH: TenantConfig = {
  id: "martial-arts-ch",
  primary_locale: "de",
  supported_locales: ["de", "fr", "it", "en"],
  currency: "CHF",
  search_collection: "products_martial_arts_ch",
  modules: {
    catalog: true,
    weight_class_filter: true,    // ON for martial arts
    warranty_extension: false,    // OFF (no warranty SKUs on gloves)
    swiss_vat_display: true,
  },
};

/**
 * Example: another shop in the multi-shop network. Same config shape, but
 * different feature toggles. Loaded by the BFF only when its requests come
 * in — the catalog tenant never sees a warranty_extension request because
 * the module isn't loaded for it.
 */
export const premiumWatchesCH: TenantConfig = {
  id: "premium-watches-ch",
  primary_locale: "de",
  supported_locales: ["de", "fr", "it", "en"],
  currency: "CHF",
  search_collection: "products_premium_watches_ch",
  modules: {
    catalog: true,
    weight_class_filter: false,   // OFF for watches
    warranty_extension: true,     // ON — watches have warranty SKUs
    swiss_vat_display: true,
  },
};

export const TENANTS: Record<string, TenantConfig> = {
  "martial-arts-ch": martialArtsCH,
  "premium-watches-ch": premiumWatchesCH,
};
