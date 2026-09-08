import { z } from "zod";

import { sha256Schema } from "./media.js";
import { projectSlugSchema } from "./project.js";

/**
 * Deterministic Preview provenance. Records which EditPlan bytes produced
 * the current preview.mp4. It is not PreviewApproval and not a Founder
 * Decision. Founder review must bind to this record rather than assuming
 * the current EditPlan file still matches the on-disk preview.
 */

export const PREVIEW_PROVENANCE_RELATIVE_PATH = "render/preview-provenance.json";
export const PREVIEW_RELATIVE_PATH = "render/preview.mp4";

export const previewProvenanceSchema = z
  .object({
    version: z.literal(1),
    project_slug: projectSlugSchema,
    project_id: z.string().min(1),
    preview_path: z.literal(PREVIEW_RELATIVE_PATH),
    preview_sha256: sha256Schema,
    edit_plan_sha256: sha256Schema,
  })
  .strict();
export type PreviewProvenance = z.infer<typeof previewProvenanceSchema>;

export function parsePreviewProvenance(input: unknown): PreviewProvenance {
  return previewProvenanceSchema.parse(input);
}
