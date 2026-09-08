import { z } from "zod";

import { directorPlanIdentitySchema, previewReferenceSchema } from "./director-decisions.js";
import { directorPlanSchema } from "./director.js";
import { projectSlugSchema } from "./project.js";

/**
 * P9.4D Golden Set contract.
 *
 * A Golden entry is a Founder-approved structured reference, not a scored
 * aesthetic example and not an ordinary DirectorPlan. Official repository
 * seed may be empty. Nothing here auto-promotes a Preview or DirectorPlan.
 *
 * Founder Edit Distance v1 is defined in the evaluator: it is a structured
 * disagreement ratio, never a perceptual quality score.
 */

export const GOLDEN_SET_RELATIVE_PATH = "golden/set.json";

const vendorPattern =
  /(asta|gpt|claude|codex|hyperframes|remotion|ffmpeg|opencut|smartsub|video-?use|openmontage)/i;

const durableIdSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !vendorPattern.test(value), {
    message: "id must not name a vendor, agent, or renderer",
  });

export const founderGoldenApprovalSchema = z
  .object({
    approved_by: z.string().trim().min(1),
    approved_at: z.string().datetime({ offset: true }),
    evidence_type: z.literal("founder_explicit"),
  })
  .strict();
export type FounderGoldenApproval = z.infer<typeof founderGoldenApprovalSchema>;

export const goldenEntrySchema = z
  .object({
    golden_id: durableIdSchema,
    project_slug: projectSlugSchema,
    project_id: z.string().min(1),
    frozen_script_sha256: directorPlanIdentitySchema.shape.director_plan_sha256,
    frozen_script_byte_size: z.number().int().nonnegative(),
    style_version: directorPlanIdentitySchema.shape.style_version,
    reference_director_plan: directorPlanSchema,
    preview_reference: previewReferenceSchema.optional(),
    approval: founderGoldenApprovalSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.project_slug !== entry.reference_director_plan.project_slug) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["project_slug"],
        message: "golden entry project_slug must match the reference DirectorPlan",
      });
    }
    if (entry.project_id !== entry.reference_director_plan.project_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["project_id"],
        message: "golden entry project_id must match the reference DirectorPlan",
      });
    }
    if (entry.frozen_script_sha256 !== entry.reference_director_plan.frozen_script.sha256) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["frozen_script_sha256"],
        message: "golden entry frozen script hash must match the reference DirectorPlan",
      });
    }
    if (entry.frozen_script_byte_size !== entry.reference_director_plan.frozen_script.byte_size) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["frozen_script_byte_size"],
        message: "golden entry frozen script byte size must match the reference DirectorPlan",
      });
    }
    if (entry.style_version !== entry.reference_director_plan.style_reference.style_version) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["style_version"],
        message: "golden entry style_version must match the reference DirectorPlan",
      });
    }
  });
export type GoldenEntry = z.infer<typeof goldenEntrySchema>;

export const goldenSetSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(goldenEntrySchema).default([]),
  })
  .strict()
  .superRefine((set, context) => {
    const seen = new Set<string>();
    for (const [index, entry] of set.entries.entries()) {
      if (seen.has(entry.golden_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entries", index, "golden_id"],
          message: "golden_id must be unique",
        });
      }
      seen.add(entry.golden_id);
    }
  });
export type GoldenSet = z.infer<typeof goldenSetSchema>;

export function parseGoldenSet(input: unknown): GoldenSet {
  return goldenSetSchema.parse(input);
}

export function parseGoldenEntry(input: unknown): GoldenEntry {
  return goldenEntrySchema.parse(input);
}

export const EMPTY_GOLDEN_SET: GoldenSet = { version: 1, entries: [] };
