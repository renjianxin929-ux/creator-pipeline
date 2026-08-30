import { describe, expect, it } from "vitest";

import { diffEditPlans, editPlanSchema, parseEditPlan } from "../src/contracts/index.js";

const basePlan = {
  version: 1,
  timeline: [
    {
      id: "clip_001",
      source: "raw/camera/capture.mp4",
      source_start_ms: 0,
      source_end_ms: 2_000,
      layout: "layout.talking-head",
      caption: true,
    },
  ],
};

describe("edit-plan contract", () => {
  it("defaults to 9:16 and accepts a project path source", () => {
    expect(parseEditPlan(basePlan)).toMatchObject({
      version: 1,
      format: "9:16",
      timeline: [
        {
          id: "clip_001",
          source: "raw/camera/capture.mp4",
          layout: "layout.talking-head",
        },
      ],
    });
  });

  it("accepts a manifest asset source and an explicit zoom", () => {
    expect(
      editPlanSchema.parse({
        version: 1,
        format: "16:9",
        timeline: [
          {
            id: "clip_002",
            source_asset_id: "asset_012",
            source_start_ms: 500,
            source_end_ms: 2_500,
            layout: "layout.screen-demo",
            caption: false,
            zoom: { enabled: true, x: 0.72, y: 0.31, scale: 1.6 },
          },
        ],
      }),
    ).toMatchObject({ format: "16:9" });
  });

  it("rejects invalid durations, ambiguous sources, and non-brand layouts", () => {
    expect(() =>
      parseEditPlan({
        ...basePlan,
        timeline: [
          {
            ...basePlan.timeline[0],
            source_end_ms: 0,
            source_asset_id: "asset_012",
            layout: "screen_demo",
          },
        ],
      }),
    ).toThrow();
  });

  it("returns a pure, concise diff", () => {
    expect(
      diffEditPlans(basePlan, {
        version: 1,
        format: "1:1",
        timeline: [
          {
            ...basePlan.timeline[0],
            source_end_ms: 2_500,
          },
          {
            id: "clip_002",
            source_asset_id: "asset_012",
            source_start_ms: 0,
            source_end_ms: 1_000,
            layout: "layout.broll",
            caption: false,
          },
        ],
      }),
    ).toEqual({
      format_changed: true,
      added_clip_ids: ["clip_002"],
      removed_clip_ids: [],
      changed_clip_ids: ["clip_001"],
      timeline_order_changed: true,
    });
  });
});
