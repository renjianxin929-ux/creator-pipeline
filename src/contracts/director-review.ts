import { z } from "zod";

import {
  directorPlanIdentitySchema,
  founderReviewSessionSchema,
  previewReferenceSchema,
} from "./director-decisions.js";
import { projectSlugSchema } from "./project.js";

/**
 * P9.4B current Founder review capture contracts.
 *
 * The review context snapshots which DirectorPlan, Preview, and EditPlan the
 * Founder is reviewing right now. It is not a Decision Dataset, contains no
 * Founder actions, and is not PreviewApproval.
 *
 * External capture files are candidates only. The official dataset path
 * review/director-decisions.json is written solely after this gate passes.
 */

export const DIRECTOR_REVIEW_CONTEXT_RELATIVE_PATH = "review/director-review-context.json";
export const DIRECTOR_REVIEW_INPUT_RELATIVE_PATH = "review/director-review-input.json";

export const founderReviewContextSchema = z
  .object({
    version: z.literal(1),
    project_slug: projectSlugSchema,
    project_id: z.string().min(1),
    director_plan_identity: directorPlanIdentitySchema,
    preview_reference: previewReferenceSchema,
    available_segment_ids: z.array(z.string().trim().min(1)).min(1),
    expected_input_path: z.literal(DIRECTOR_REVIEW_INPUT_RELATIVE_PATH),
  })
  .strict();
export type FounderReviewContext = z.infer<typeof founderReviewContextSchema>;

export function parseFounderReviewContext(input: unknown): FounderReviewContext {
  return founderReviewContextSchema.parse(input);
}

/**
 * External structured capture payload. Identities must match the current
 * review context; decisions are the only Founder-authored content.
 */
export const founderReviewCaptureSchema = z
  .object({
    version: z.literal(1),
    project_slug: projectSlugSchema,
    project_id: z.string().min(1),
    review_id: founderReviewSessionSchema.shape.review_id,
    director_plan_identity: directorPlanIdentitySchema,
    preview_reference: previewReferenceSchema,
    decisions: founderReviewSessionSchema.shape.decisions,
  })
  .strict();
export type FounderReviewCapture = z.infer<typeof founderReviewCaptureSchema>;

export function parseFounderReviewCapture(input: unknown): FounderReviewCapture {
  return founderReviewCaptureSchema.parse(input);
}
