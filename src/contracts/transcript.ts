import { z } from "zod";

const timestampMillisecondsSchema = z.number().int().nonnegative();

function addInvalidTimeRangeIssue(
  startMs: number,
  endMs: number,
  context: z.RefinementCtx,
): void {
  if (endMs <= startMs) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["end_ms"],
      message: "end_ms must be greater than start_ms",
    });
  }
}

/**
 * Normalized speech segment owned by Creator Pipeline. ASR adapters must map
 * their native output here before it is used by the rest of the pipeline.
 */
export const transcriptSegmentSchema = z
  .object({
    id: z.string().min(1),
    start_ms: timestampMillisecondsSchema,
    end_ms: timestampMillisecondsSchema,
    speaker: z.string().min(1),
    text: z.string().trim().min(1),
    confidence: z.number().min(0).max(1).optional(),
    keep: z.boolean().optional(),
  })
  .strict()
  .superRefine((segment, context) => {
    addInvalidTimeRangeIssue(segment.start_ms, segment.end_ms, context);
  });

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

/**
 * Transcript records must be chronological and non-overlapping so downstream
 * edit stages can reason about every timestamp without guessing.
 */
export const transcriptDocumentSchema = z
  .object({
    source_media_id: z.string().min(1),
    language: z.string().min(1).optional(),
    segments: z.array(transcriptSegmentSchema),
  })
  .strict()
  .superRefine((document, context) => {
    const seenIds = new Set<string>();

    for (let index = 0; index < document.segments.length; index += 1) {
      const segment = document.segments[index]!;
      const previous = document.segments[index - 1];

      if (seenIds.has(segment.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "id"],
          message: "segment ids must be unique",
        });
      }
      seenIds.add(segment.id);

      if (previous === undefined) {
        continue;
      }

      if (segment.start_ms < previous.start_ms) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "start_ms"],
          message: "segments must be ordered by start_ms",
        });
      }

      if (segment.start_ms < previous.end_ms) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "start_ms"],
          message: "segments must not overlap",
        });
      }
    }
  });

export type TranscriptDocument = z.infer<typeof transcriptDocumentSchema>;

export const silenceReasonValues = ["silence", "long_pause"] as const;
export const silenceReasonSchema = z.enum(silenceReasonValues);
export type SilenceReason = z.infer<typeof silenceReasonSchema>;

export const silenceIntervalSchema = z
  .object({
    start_ms: timestampMillisecondsSchema,
    end_ms: timestampMillisecondsSchema,
    reason: silenceReasonSchema,
  })
  .strict()
  .superRefine((interval, context) => {
    addInvalidTimeRangeIssue(interval.start_ms, interval.end_ms, context);
  });

export type SilenceInterval = z.infer<typeof silenceIntervalSchema>;

/** A derived map is always tied to the media that produced the transcript. */
export const silenceMapSchema = z
  .object({
    source_media_id: z.string().min(1),
    intervals: z.array(silenceIntervalSchema),
  })
  .strict()
  .superRefine((silenceMap, context) => {
    for (let index = 1; index < silenceMap.intervals.length; index += 1) {
      const previous = silenceMap.intervals[index - 1]!;
      const interval = silenceMap.intervals[index]!;

      if (interval.start_ms < previous.start_ms) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["intervals", index, "start_ms"],
          message: "silence intervals must be ordered by start_ms",
        });
      }

      if (interval.start_ms < previous.end_ms) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["intervals", index, "start_ms"],
          message: "silence intervals must not overlap",
        });
      }
    }
  });

export type SilenceMap = z.infer<typeof silenceMapSchema>;

/**
 * Produces a stable SRT file from normalized Creator Pipeline segments.
 * Input is validated here as well so callers cannot render invalid timings.
 */
export function renderSrt(segments: readonly TranscriptSegment[]): string {
  const transcript = transcriptDocumentSchema.parse({
    source_media_id: "srt-render-input",
    segments,
  });

  if (transcript.segments.length === 0) {
    return "";
  }

  return `${transcript.segments
    .map(
      (segment, index) =>
        `${index + 1}\n${formatSrtTimestamp(segment.start_ms)} --> ${formatSrtTimestamp(segment.end_ms)}\n${segment.text}`,
    )
    .join("\n\n")}\n`;
}

function formatSrtTimestamp(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainder = milliseconds % 1_000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(remainder).padStart(3, "0")}`;
}
