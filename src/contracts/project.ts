import { z } from "zod";

import {
  brandOverrideSchema,
  brandTemplateSelectionSchema,
  brandVersionSchema,
} from "./brand.js";
import { projectGenerationBudgetSchema } from "./assets.js";

export const projectSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must use lowercase letters, numbers, and hyphens");

export const projectIdentitySchema = z
  .object({
    id: z.string().min(1),
    slug: projectSlugSchema,
    created_at: z.string().datetime({ offset: true }),
    brand_version: brandVersionSchema.optional(),
    brand_override: brandOverrideSchema.optional(),
    brand_templates: brandTemplateSelectionSchema.optional(),
    budget: projectGenerationBudgetSchema,
  })
  .strict();

export type ProjectIdentity = z.infer<typeof projectIdentitySchema>;
