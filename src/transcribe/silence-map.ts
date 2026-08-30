import {
  silenceMapSchema,
  transcriptDocumentSchema,
  type SilenceInterval,
  type SilenceMap,
  type TranscriptDocument,
} from "../contracts/index.js";

export const longPauseThresholdMs = 2_000;

/**
 * Records only gaps between validated transcript segments. It deliberately
 * makes no cutting decision and does not guess leading/trailing silence when
 * a media duration is unavailable.
 */
export function deriveSilenceMap(transcript: TranscriptDocument): SilenceMap {
  const document = transcriptDocumentSchema.parse(transcript);
  const intervals: SilenceInterval[] = [];

  for (let index = 1; index < document.segments.length; index += 1) {
    const previous = document.segments[index - 1]!;
    const current = document.segments[index]!;
    const gap = current.start_ms - previous.end_ms;

    if (gap <= 0) {
      continue;
    }

    intervals.push({
      start_ms: previous.end_ms,
      end_ms: current.start_ms,
      reason: gap >= longPauseThresholdMs ? "long_pause" : "silence",
    });
  }

  return silenceMapSchema.parse({
    source_media_id: document.source_media_id,
    intervals,
  });
}
