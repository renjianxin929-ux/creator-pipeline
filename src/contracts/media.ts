import { z } from "zod";

export const mediaKindValues = ["camera", "screen", "audio", "image", "misc"] as const;
export const mediaKindSchema = z.enum(mediaKindValues);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const mediaOrientationValues = ["landscape", "portrait", "square", "unknown"] as const;
export const mediaOrientationSchema = z.enum(mediaOrientationValues);
export type MediaOrientation = z.infer<typeof mediaOrientationSchema>;

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "sha256 must be a lowercase hex digest");

/**
 * The media ID is a stable identity derived from the complete content digest.
 * A source or stored filename is intentionally never part of that identity.
 */
export function mediaIdFromSha256(sha256: string): string {
  return `sha256:${sha256}`;
}

/**
 * Normalized media facts owned by Creator Pipeline. Adapters must map their
 * native output into this contract rather than persisting vendor JSON.
 */
export const mediaRecordSchema = z
  .object({
    id: z.string().min(1),
    sha256: sha256Schema,
    byte_size: z.number().int().nonnegative(),
    path: z.string().min(1),
    kind: mediaKindSchema,
    duration_ms: z.number().int().nonnegative().optional(),
    fps: z.number().positive().optional(),
    codec: z.string().min(1).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    has_audio: z.boolean().optional(),
    orientation: mediaOrientationSchema.optional(),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.id !== mediaIdFromSha256(record.sha256)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: "id must be derived from sha256",
      });
    }
  });

export type MediaRecord = z.infer<typeof mediaRecordSchema>;

export const mediaRecordListSchema = z.array(mediaRecordSchema);
