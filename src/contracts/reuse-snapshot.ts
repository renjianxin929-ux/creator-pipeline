import { z } from "zod";

import { brandTemplateDefaultsSchema, brandVersionSchema } from "./brand.js";
import { editPlanFormatSchema } from "./edit-plan.js";
import { platformIdSchema } from "./publish.js";
import { projectSlugSchema } from "./project.js";

/**
 * Portable project guidance for a future project. It intentionally contains
 * only small structured choices, never media paths, media bytes, credentials,
 * or generated provider input/output.
 */
export const reuseSnapshotSchema = z
  .object({
    version: z.literal(1),
    project_slug: projectSlugSchema,
    brand_version: brandVersionSchema,
    template_defaults: brandTemplateDefaultsSchema,
    edit_plan_format: editPlanFormatSchema.nullable(),
    publish_plan_platforms: z.array(platformIdSchema),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (new Set(snapshot.publish_plan_platforms).size !== snapshot.publish_plan_platforms.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publish_plan_platforms"],
        message: "publish_plan_platforms must not repeat a platform",
      });
    }
  });

export type ReuseSnapshot = z.infer<typeof reuseSnapshotSchema>;
