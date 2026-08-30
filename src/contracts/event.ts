import { z } from "zod";

/**
 * Event records are intentionally narrow: callers cannot add token, cookie,
 * request-body, or other secret-bearing fields to the persisted event stream.
 */
export const eventRecordSchema = z
  .object({
    ts: z.string().datetime({ offset: true }),
    stage: z.string().min(1),
    event: z.string().min(1),
    project: z.string().min(1),
    provider: z.string().min(1).optional(),
    request_id: z.string().min(1).optional(),
  })
  .strict();

export type EventRecord = z.infer<typeof eventRecordSchema>;
