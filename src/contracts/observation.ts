import { z } from "zod";

import { platformIdSchema, publishResultStatusSchema } from "./publish.js";

/**
 * A local record of a publish outcome. P8 deliberately has no platform
 * scraping: analytics placeholders are always null until a separately
 * authorized adapter owns those facts.
 */
export const publishObservationSchema = z
  .object({
    platform: platformIdSchema,
    dry_run: z.boolean(),
    status: publishResultStatusSchema,
    recorded_at: z.string().datetime({ offset: true }),
    view_count: z.null().default(null),
    comment_count: z.null().default(null),
  })
  .strict();

export type PublishObservation = z.infer<typeof publishObservationSchema>;

/**
 * Retry timing is declarative project data. Nothing in this contract starts a
 * timer, schedules a job, or invokes an external provider.
 */
export const retryBackoffSchema = z
  .object({
    delays_ms: z.array(z.number().int().nonnegative()),
  })
  .strict();

export type RetryBackoff = z.infer<typeof retryBackoffSchema>;

export const retryPolicySchema = z
  .object({
    max_attempts: z.number().int().min(1),
    backoff: retryBackoffSchema,
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.backoff.delays_ms.length > policy.max_attempts - 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["backoff", "delays_ms"],
        message: "backoff delays cannot exceed the available retry attempts",
      });
    }
  });

export type RetryPolicy = z.infer<typeof retryPolicySchema>;
