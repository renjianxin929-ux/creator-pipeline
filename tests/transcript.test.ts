import { describe, expect, it } from "vitest";

import {
  renderSrt,
  silenceMapSchema,
  transcriptDocumentSchema,
  transcriptSegmentSchema,
} from "../src/contracts/transcript.ts";
import { deriveSilenceMap } from "../src/transcribe/silence-map.ts";

const document = {
  source_media_id: "sha256:abc",
  language: "zh",
  segments: [
    {
      id: "seg_001",
      start_ms: 0,
      end_ms: 800,
      speaker: "spk_0",
      text: "第一句。",
      confidence: 0.99,
    },
    {
      id: "seg_002",
      start_ms: 1_200,
      end_ms: 1_850,
      speaker: "spk_0",
      text: "第二句。",
    },
    {
      id: "seg_003",
      start_ms: 4_000,
      end_ms: 4_700,
      speaker: "spk_0",
      text: "第三句。",
      keep: true,
    },
  ],
};

describe("P2 transcript contracts", () => {
  it("accepts a normalized chronological transcript and renders deterministic SRT", () => {
    const parsed = transcriptDocumentSchema.parse(document);

    expect(renderSrt(parsed.segments)).toBe(
      "1\n00:00:00,000 --> 00:00:00,800\n第一句。\n\n2\n00:00:01,200 --> 00:00:01,850\n第二句。\n\n3\n00:00:04,000 --> 00:00:04,700\n第三句。\n",
    );
  });

  it("rejects negative, reversed, and overlapping segment timings", () => {
    expect(() => transcriptSegmentSchema.parse({ ...document.segments[0], start_ms: -1 })).toThrow();
    expect(() => transcriptSegmentSchema.parse({ ...document.segments[0], end_ms: 0 })).toThrow(
      "end_ms must be greater than start_ms",
    );
    expect(() =>
      transcriptDocumentSchema.parse({
        ...document,
        segments: [document.segments[0], { ...document.segments[1], start_ms: 700 }],
      }),
    ).toThrow("segments must not overlap");
  });

  it("derives only informational silence intervals and validates their ranges", () => {
    const silenceMap = deriveSilenceMap(transcriptDocumentSchema.parse(document));

    expect(silenceMap).toEqual({
      source_media_id: "sha256:abc",
      intervals: [
        { start_ms: 800, end_ms: 1_200, reason: "silence" },
        { start_ms: 1_850, end_ms: 4_000, reason: "long_pause" },
      ],
    });
    expect(() =>
      silenceMapSchema.parse({
        source_media_id: "sha256:abc",
        intervals: [
          { start_ms: 100, end_ms: 200, reason: "silence" },
          { start_ms: 150, end_ms: 300, reason: "long_pause" },
        ],
      }),
    ).toThrow("silence intervals must not overlap");
  });
});
