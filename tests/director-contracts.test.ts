import { describe, expect, it } from "vitest";

import {
  directorPlanSchema,
  isDirectorPlanStale,
  styleManifestSchema,
  validateDirectorPlanAgainstStyle,
} from "../src/contracts/director.ts";

const validPlan = {
  version: 1,
  project_slug: "demo",
  source_script: {
    path: "content/frozen-script.md",
    sha256: "a".repeat(64),
  },
  style: {
    style_version: "1.0",
  },
  created_at: "2026-09-08T00:00:00.000Z",
  segments: [
    {
      id: "seg_001",
      semantic_role: "PROOF",
      time_range: { start_ms: 1_000, end_ms: 4_000 },
      script_range: { start_char: 0, end_char: 18, quote: "这里给出真实证据" },
      visual: {
        selected: "screen_demo",
        allowed: ["screen_demo", "screenshot"],
        forbidden: ["broll"],
      },
      caption: {
        mode: "emphasis",
        emphasis: ["真实证据"],
      },
      motion_id: "motion.ui-focus",
      reason: "The spoken claim is being proven with real product evidence.",
      confidence: 0.92,
    },
  ],
} as const;

const styleManifest = {
  version: 1,
  style_version: "1.0",
  visual_choices: ["talking_head", "screen_demo", "screenshot", "broll"],
  caption_modes: ["off", "default", "emphasis"],
  motion_ids: ["motion.ui-focus", "motion.evidence-highlight"],
} as const;

describe("P9.1 Director contracts", () => {
  it("accepts a valid structured Director Plan", () => {
    expect(directorPlanSchema.parse(validPlan)).toMatchObject({
      project_slug: "demo",
      segments: [{ semantic_role: "PROOF" }],
    });
    expect(styleManifestSchema.parse(styleManifest)).toEqual(styleManifest);
    expect(validateDirectorPlanAgainstStyle(validPlan, styleManifest)).toMatchObject({
      style: { style_version: "1.0" },
    });
  });

  it("rejects invalid semantic roles", () => {
    expect(() =>
      directorPlanSchema.parse({
        ...validPlan,
        segments: [{ ...validPlan.segments[0], semantic_role: "ADVERTISEMENT" }],
      }),
    ).toThrow();
  });

  it("rejects invalid and overlapping time ranges", () => {
    expect(() =>
      directorPlanSchema.parse({
        ...validPlan,
        segments: [
          { ...validPlan.segments[0], time_range: { start_ms: 2_000, end_ms: 2_000 } },
        ],
      }),
    ).toThrow();

    expect(() =>
      directorPlanSchema.parse({
        ...validPlan,
        segments: [
          validPlan.segments[0],
          {
            ...validPlan.segments[0],
            id: "seg_002",
            time_range: { start_ms: 3_500, end_ms: 5_000 },
          },
        ],
      }),
    ).toThrow("director segments must be ordered and non-overlapping");
  });

  it("rejects unsupported style references", () => {
    expect(() =>
      validateDirectorPlanAgainstStyle(
        {
          ...validPlan,
          segments: [{ ...validPlan.segments[0], motion_id: "motion.unknown" }],
        },
        styleManifest,
      ),
    ).toThrow("unsupported motion id");

    expect(() =>
      validateDirectorPlanAgainstStyle(
        {
          ...validPlan,
          style: { style_version: "2.0" },
        },
        styleManifest,
      ),
    ).toThrow("does not match Style Manifest");
  });

  it("detects stale Director Plans only from frozen-script byte identity", () => {
    const parsed = directorPlanSchema.parse(validPlan);
    expect(isDirectorPlanStale(parsed, "a".repeat(64))).toBe(false);
    expect(isDirectorPlanStale(parsed, "b".repeat(64))).toBe(true);
  });
});
