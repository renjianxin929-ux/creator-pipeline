import { z } from "zod";

import { sha256Schema } from "./media.js";
import { publishResultSchema } from "./publish.js";
import { projectSlugSchema } from "./project.js";
import { projectStateValueSchema } from "./state.js";

export const reportAbsentValue = "absent" as const;
export const reportAbsentSchema = z.literal(reportAbsentValue);
export type ReportAbsent = z.infer<typeof reportAbsentSchema>;

/**
 * A local, human-readable summary of structured project facts. This remains a
 * report artifact; it is never used to drive the project state machine.
 */
export const projectReportSchema = z
  .object({
    version: z.literal(1),
    project_slug: projectSlugSchema,
    state: projectStateValueSchema,
    media_count: z.number().int().nonnegative(),
    transcript_adapter: z.union([z.string().min(1), reportAbsentSchema]),
    preview_hash: z.union([sha256Schema, reportAbsentSchema]),
    export_master_hash: z.union([sha256Schema, reportAbsentSchema]),
    dry_run_results: z.union([z.array(publishResultSchema), reportAbsentSchema]),
  })
  .strict();

export type ProjectReport = z.infer<typeof projectReportSchema>;
