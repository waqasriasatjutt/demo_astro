// =============================================================================
// Category@v1 - Data Contract Rule (Rule 2)
// =============================================================================
// Navigation + faceting node. A projection of the e-commerce category tree.
// Carries the slug path (breadcrumb) and which attributes facet inside it -
// that list drives the Typesense facet_by at listing time (Rule 4).
// =============================================================================

import { z } from "zod";
import { I18nString, ValidationState } from "./product.js";

export const CONTRACT_VERSION = "Category@v1";

export const CategorySchema = z.object({
  _contract: z.literal(CONTRACT_VERSION),
  slug: z.string(),
  parent_slug: z.string().nullable(),
  path: z.array(z.string()),           // breadcrumb slugs, root -> leaf
  name: I18nString,
  facet_keys: z.array(z.string()).default([]), // attribute slugs that facet in this category
  validation_state: ValidationState,
});
export type Category = z.infer<typeof CategorySchema>;
