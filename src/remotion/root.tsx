import { Composition } from "remotion";
import type { ReactNode } from "react";

import {
  CREATOR_PREVIEW_FPS,
  CreatorPreview,
  getPreviewDurationInFrames,
  type CreatorPreviewProps,
} from "./preview-composition.js";

export const CREATOR_PREVIEW_COMPOSITION_ID = "CreatorPreview";

const defaultPreviewProps: CreatorPreviewProps = {
  cut_video_src: "rough-cut.mp4",
  edit_plan: {
    version: 1,
    format: "9:16",
    timeline: [
      {
        id: "placeholder",
        source: "rough-cut.mp4",
        source_start_ms: 0,
        source_end_ms: 1_000,
        layout: "layout.talking-head",
        caption: false,
      },
    ],
  },
  captions: [],
  brand: {
    tokens: {
      colors: { background: "#111111", foreground: "#f5f5f5", accent: "#3b82f6" },
      typography: {
        font_family: ["sans-serif"],
        font_weight_regular: 400,
        font_weight_semibold: 600,
        font_weight_bold: 700,
      },
      spacing: { xs: 8, sm: 16, md: 24, lg: 32, xl: 48 },
      safe_area: { top: 96, right: 48, bottom: 96, left: 48 },
    },
    defaults: {
      templates: {
        cover: "cover.tutorial",
        caption: "caption.default",
        title: "title.hook",
        layout: "layout.talking-head",
        motion: "motion.intro",
      },
      cover_title_size: 72,
      caption_max_lines: 2,
    },
  },
};

export function RemotionRoot(): ReactNode {
  return (
    <Composition<any, CreatorPreviewProps>
      id={CREATOR_PREVIEW_COMPOSITION_ID}
      component={CreatorPreview}
      width={1080}
      height={1920}
      fps={CREATOR_PREVIEW_FPS}
      defaultProps={defaultPreviewProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: getPreviewDurationInFrames(props.edit_plan, CREATOR_PREVIEW_FPS),
      })}
    />
  );
}
