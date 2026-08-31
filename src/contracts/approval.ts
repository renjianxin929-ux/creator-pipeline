import { z } from "zod";

import { sha256Schema } from "./media.js";

/**
 * A Founder approval is evidence for one exact preview file. Project state
 * records the gate's position; this record identifies the approved bytes.
 */
export const previewApprovalSchema = z
  .object({
    preview_path: z.string().min(1),
    preview_sha256: sha256Schema,
    approved_at: z.string().datetime({ offset: true }),
    approved_by: z.string().min(1),
    edit_plan_sha256: sha256Schema.optional(),
    notes: z.string().min(1).optional(),
  })
  .strict();

export type PreviewApproval = z.infer<typeof previewApprovalSchema>;
