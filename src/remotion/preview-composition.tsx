import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ReactNode } from "react";

import { parseEditPlan, type EditPlan, type EditPlanClip, type ResolvedBrand } from "../contracts/index.js";

export interface PreviewCaption {
  id: string;
  start_ms: number;
  end_ms: number;
  text: string;
}

export type PreviewBrand = Pick<ResolvedBrand, "tokens" | "defaults">;

/**
 * These props intentionally carry the edit plan itself. The composition never
 * receives a second visual timeline: clip timing and zoom are derived only
 * from plans/edit-plan.json, while captions remain an overlay.
 */
export type CreatorPreviewProps = {
  cut_video_src: string;
  edit_plan: EditPlan;
  captions: readonly PreviewCaption[];
  brand: PreviewBrand;
  hook_title?: string;
};

export const CREATOR_PREVIEW_FPS = 30;

export function CreatorPreview({
  cut_video_src,
  edit_plan,
  captions,
  brand,
  hook_title,
}: CreatorPreviewProps): ReactNode {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const currentMs = (frame / fps) * 1_000;
  const activeClip = getActiveEditPlanClip(edit_plan, currentMs);
  const activeCaptions = getActivePreviewCaptions(captions, currentMs);
  const zoom = activeClip?.zoom?.enabled ? activeClip.zoom : undefined;
  const hookOpacity = interpolate(
    frame,
    [0, Math.min(12, durationInFrames), Math.min(90, durationInFrames), Math.min(120, durationInFrames)],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const fontFamily = brand.tokens.typography.font_family.join(", ");

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.tokens.colors.background,
        color: brand.tokens.colors.foreground,
        fontFamily,
        overflow: "hidden",
      }}
    >
      <OffthreadVideo
        src={staticFile(cut_video_src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transformOrigin: zoom === undefined ? "50% 50%" : `${zoom.x * 100}% ${zoom.y * 100}%`,
          transform: zoom === undefined ? undefined : `scale(${zoom.scale})`,
        }}
      />
      {hook_title?.trim() === "" || hook_title === undefined ? null : (
        <div
          style={{
            position: "absolute",
            top: brand.tokens.safe_area.top,
            left: brand.tokens.safe_area.left,
            right: brand.tokens.safe_area.right,
            color: brand.tokens.colors.foreground,
            fontSize: brand.defaults.cover_title_size,
            fontWeight: brand.tokens.typography.font_weight_bold,
            lineHeight: 1.08,
            opacity: hookOpacity,
            textShadow: `0 3px 12px ${brand.tokens.colors.background}`,
          }}
        >
          {hook_title}
        </div>
      )}
      {activeCaptions.length === 0 ? null : (
        <div
          style={{
            position: "absolute",
            left: brand.tokens.safe_area.left,
            right: brand.tokens.safe_area.right,
            bottom: brand.tokens.safe_area.bottom,
            color: brand.tokens.colors.foreground,
            backgroundColor: brand.tokens.colors.background,
            borderLeft: `${brand.tokens.spacing.sm}px solid ${brand.tokens.colors.accent}`,
            borderRadius: brand.tokens.spacing.xs,
            fontSize: 48,
            fontWeight: brand.tokens.typography.font_weight_semibold,
            lineHeight: 1.25,
            padding: `${brand.tokens.spacing.sm}px ${brand.tokens.spacing.md}px`,
            whiteSpace: "pre-line",
          }}
        >
          {activeCaptions.map((caption) => caption.text).join("\n")}
        </div>
      )}
    </AbsoluteFill>
  );
}

export function getEditPlanDurationMs(planInput: EditPlan): number {
  const plan = parseEditPlan(planInput);
  return plan.timeline.reduce((total, clip) => total + clip.source_end_ms - clip.source_start_ms, 0);
}

/** Maps output time to the sole edit-plan timeline, not a renderer-owned one. */
export function getActiveEditPlanClip(
  planInput: EditPlan,
  outputTimeMs: number,
): EditPlanClip | undefined {
  const plan = parseEditPlan(planInput);
  let elapsedMs = 0;

  for (const clip of plan.timeline) {
    const durationMs = clip.source_end_ms - clip.source_start_ms;
    if (outputTimeMs >= elapsedMs && outputTimeMs < elapsedMs + durationMs) {
      return clip;
    }
    elapsedMs += durationMs;
  }

  return undefined;
}

export function getPreviewDurationInFrames(plan: EditPlan, fps = CREATOR_PREVIEW_FPS): number {
  if (!Number.isInteger(fps) || fps <= 0) {
    throw new Error("Preview fps must be a positive integer");
  }

  return Math.max(1, Math.ceil((getEditPlanDurationMs(plan) / 1_000) * fps));
}

export function getActivePreviewCaptions(
  captions: readonly PreviewCaption[],
  outputTimeMs: number,
): readonly PreviewCaption[] {
  return captions.filter(
    (caption) =>
      Number.isFinite(caption.start_ms) &&
      Number.isFinite(caption.end_ms) &&
      caption.end_ms > caption.start_ms &&
      outputTimeMs >= caption.start_ms &&
      outputTimeMs < caption.end_ms,
  );
}
