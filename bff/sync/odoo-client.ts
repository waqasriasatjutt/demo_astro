// =============================================================================
// BFF Law (Rule 1) — Astro is NOT in this file. Only the BFF talks to Odoo.
// =============================================================================
// In production, OdooClient.fetchAllProducts() would call Odoo's /jsonrpc
// endpoint with the API key from BFF env vars only. For this short demo we
// inline a small fixture so the demo container has no external dependency,
// but the seam (OdooClient class, async signature, contract-mapping) is the
// real shape — swapping in real /jsonrpc is a one-method change.
// =============================================================================

import { Product, CONTRACT_VERSION } from "../contracts/product.js";

export class OdooClient {
  private readonly baseUrl: string;
  private readonly db: string;
  private readonly apiKey: string;

  constructor(opts: { baseUrl: string; db: string; apiKey: string }) {
    this.baseUrl = opts.baseUrl;
    this.db = opts.db;
    this.apiKey = opts.apiKey;
  }

  /**
   * In production:
   *   POST `${this.baseUrl}/jsonrpc`
   *   body: { method: "call", params: { service: "object", method: "execute_kw",
   *           args: [this.db, uid, this.apiKey, "product.product", "search_read",
   *                  [[]], { fields: [...], limit: 500 }] }}
   *
   * For the demo: return mocked products that follow the same Product@v1 shape.
   */
  async fetchAllProducts(): Promise<Product[]> {
    return MOCK_PRODUCTS;
  }
}

// -----------------------------------------------------------------------------
// Demo fixture — 8 boxing gloves across 3 brands, deliberately uneven so the
// interdependent-facets behaviour is visible (Hayabusa has no XS, Venum has
// no red, RDX has only 14oz, etc.).
// -----------------------------------------------------------------------------
const MOCK_PRODUCTS: Product[] = [
  {
    _contract: CONTRACT_VERSION,
    slug: "hayabusa-t3-14oz-black",
    sku: "HAYA-T3-14-BLK",
    brand: "Hayabusa",
    category_slugs: ["boxing-gloves"],
    attributes: { size: "M", weight_oz: "14oz", color: "black" },
    in_stock: true,
    price_chf: 219.0,
    name: {
      de: "Hayabusa T3 14oz Boxhandschuhe",
      en: "Hayabusa T3 14oz Boxing Gloves",
    },
    description: {
      de: "Profi-Boxhandschuh, 14 Unzen, schwarz.",
      en: "Pro boxing glove, 14oz, black.",
    },
    image: "https://placehold.co/300x300/000/fff?text=Hayabusa+T3",
    validation_state: "live",
  },
  {
    _contract: CONTRACT_VERSION,
    slug: "hayabusa-t3-16oz-black",
    sku: "HAYA-T3-16-BLK",
    brand: "Hayabusa",
    category_slugs: ["boxing-gloves"],
    attributes: { size: "L", weight_oz: "16oz", color: "black" },
    in_stock: true,
    price_chf: 229.0,
    name: { de: "Hayabusa T3 16oz", en: "Hayabusa T3 16oz" },
    description: { de: "16 Unzen, schwarz.", en: "16oz, black." },
    image: "https://placehold.co/300x300/000/fff?text=Hayabusa+T3+16",
    validation_state: "live",
  },
  {
    _contract: CONTRACT_VERSION,
    slug: "hayabusa-t3-12oz-red",
    sku: "HAYA-T3-12-RED",
    brand: "Hayabusa",
    category_slugs: ["boxing-gloves"],
    attributes: { size: "S", weight_oz: "12oz", color: "red" },
    in_stock: true,
    price_chf: 199.0,
    name: { de: "Hayabusa T3 12oz Rot", en: "Hayabusa T3 12oz Red" },
    description: { de: "12 Unzen, rot.", en: "12oz, red." },
    image: "https://placehold.co/300x300/c00/fff?text=Hayabusa+T3+Red",
    validation_state: "live",
  },
  {
    _contract: CONTRACT_VERSION,
    slug: "venum-elite-14oz-black",
    sku: "VENUM-EL-14-BLK",
    brand: "Venum",
    category_slugs: ["boxing-gloves"],
    attributes: { size: "M", weight_oz: "14oz", color: "black" },
    in_stock: true,
    price_chf: 89.0,
    name: { de: "Venum Elite 14oz", en: "Venum Elite 14oz" },
    description: { de: "Klassiker, 14oz.", en: "Classic, 14oz." },
    image: "https://placehold.co/300x300/222/fff?text=Venum+Elite",
    validation_state: "live",
  },
  {
    _contract: CONTRACT_VERSION,
    slug: "venum-elite-16oz-white",
    sku: "VENUM-EL-16-WHT",
    brand: "Venum",
    category_slugs: ["boxing-gloves"],
    attributes: { size: "L", weight_oz: "16oz", color: "white" },
    in_stock: true,
    price_chf: 99.0,
    name: { de: "Venum Elite 16oz Weiss", en: "Venum Elite 16oz White" },
    description: { de: "16oz, weiss.", en: "16oz, white." },
    image: "https://placehold.co/300x300/eee/333?text=Venum+Elite+White",
    validation_state: "live",
  },
  {
    _contract: CONTRACT_VERSION,
    slug: "venum-elite-12oz-black",
    sku: "VENUM-EL-12-BLK",
    brand: "Venum",
    category_slugs: ["boxing-gloves"],
    attributes: { size: "S", weight_oz: "12oz", color: "black" },
    in_stock: true,
    price_chf: 79.0,
    name: { de: "Venum Elite 12oz", en: "Venum Elite 12oz" },
    description: { de: "12oz.", en: "12oz." },
    image: "https://placehold.co/300x300/111/fff?text=Venum+Elite+12",
    validation_state: "live",
  },
  {
    _contract: CONTRACT_VERSION,
    slug: "rdx-f7-14oz-black",
    sku: "RDX-F7-14-BLK",
    brand: "RDX",
    category_slugs: ["boxing-gloves"],
    attributes: { size: "M", weight_oz: "14oz", color: "black" },
    in_stock: true,
    price_chf: 59.0,
    name: { de: "RDX F7 14oz", en: "RDX F7 14oz" },
    description: { de: "Einstiegsmodell, 14oz.", en: "Entry model, 14oz." },
    image: "https://placehold.co/300x300/333/fff?text=RDX+F7",
    validation_state: "live",
  },
  {
    _contract: CONTRACT_VERSION,
    slug: "rdx-f7-14oz-red",
    sku: "RDX-F7-14-RED",
    brand: "RDX",
    category_slugs: ["boxing-gloves"],
    attributes: { size: "L", weight_oz: "14oz", color: "red" },
    in_stock: true,
    price_chf: 59.0,
    name: { de: "RDX F7 14oz Rot", en: "RDX F7 14oz Red" },
    description: { de: "14oz, rot.", en: "14oz, red." },
    image: "https://placehold.co/300x300/900/fff?text=RDX+F7+Red",
    validation_state: "live",
  },
  // Intentionally NOT live — proves validation_state gating from Rule 2.
  {
    _contract: CONTRACT_VERSION,
    slug: "rdx-f7-12oz-white-draft",
    sku: "RDX-F7-12-WHT",
    brand: "RDX",
    category_slugs: ["boxing-gloves"],
    attributes: { size: "S", weight_oz: "12oz", color: "white" },
    in_stock: true,
    price_chf: 49.0,
    name: { de: "RDX F7 12oz Weiss", en: "" }, // missing EN translation
    description: { de: "Entwurf", en: "" },
    image: "https://placehold.co/300x300/eee/333?text=DRAFT",
    validation_state: "needs_translation", // <- will NOT be indexed
  },
];
