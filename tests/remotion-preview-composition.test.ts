import { describe, expect, it } from "vitest";

import { parseEditPlan } from "../src/contracts/index.ts";
import {
  getActiveEditPlanClip,
  getActivePreviewCaptions,
  getPreviewDurationInFrames,
} from "../src/remotion/preview-composition.tsx";

const plan = parseEditPlan({
  version: 1,
  timeline: [
    {
      id: "clip_001",
      source: "raw/camera/capture.mp4",
      source_start_ms: 0,
      source_end_ms: 1_000,
      layout: "layout.talking-head",
      caption: true,
    },
    {
      id: "clip_002",
      source: "raw/screen/demo.mp4",
      source_start_ms: 2_000,
      source_end_ms: 3_500,
      layout: "layout.screen-demo",
      caption: true,
      zoom: { enabled: true, x: 0.7, y: 0.3, scale: 1.4 },
    },
  ],
});

describe("Remotion preview composition", () => {
  it("derives active clip timing and preview duration from edit-plan only", () => {
    expect(getActiveEditPlanClip(plan, 999)?.id).toBe("clip_001");
    expect(getActiveEditPlanClip(plan, 1_000)?.id).toBe("clip_002");
    expect(getActiveEditPlanClip(plan, 2_500)).toBeUndefined();
    expect(getPreviewDurationInFrames(plan, 30)).toBe(75);
  });

  it("keeps captions as an overlay with explicit output timestamps", () => {
    const captions = [
      { id: "caption_001", start_ms: 0, end_ms: 400, text: "第一句" },
      { id: "caption_002", start_ms: 400, end_ms: 1_000, text: "第二句" },
    ];

    expect(getActivePreviewCaptions(captions, 399).map((caption) => caption.id)).toEqual(["caption_001"]);
    expect(getActivePreviewCaptions(captions, 400).map((caption) => caption.id)).toEqual(["caption_002"]);
  });
});
