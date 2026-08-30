import { z } from "zod";

import { templateIdSchema } from "./brand.js";

export const editPlanFormatValues = ["9:16", "16:9", "1:1"] as const;
export const editPlanFormatSchema = z.enum(editPlanFormatValues);
export type EditPlanFormat = z.infer<typeof editPlanFormatSchema>;

/**
 * The timeline names the versioned brand layout that the renderer must use.
 * This deliberately keeps renderer-specific layouts out of the edit plan.
 */
export const editPlanLayoutSchema = templateIdSchema.refine((templateId) => templateId.startsWith("layout."), {
  message: "layout must be a registered brand layout id",
});
export type EditPlanLayout = z.infer<typeof editPlanLayoutSchema>;

const millisecondsSchema = z.number().int().nonnegative();

export const editPlanZoomSchema = z
  .object({
    enabled: z.boolean(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    scale: z.number().positive(),
  })
  .strict();
export type EditPlanZoom = z.infer<typeof editPlanZoomSchema>;

/**
 * A deterministic instruction for one clip. Exactly one source selector is
 * permitted: a project-relative source path or an asset-manifest ID.
 */
export const editPlanClipSchema = z
  .object({
    id: z.string().trim().min(1),
    source: z.string().trim().min(1).optional(),
    source_asset_id: z.string().trim().min(1).optional(),
    source_start_ms: millisecondsSchema,
    source_end_ms: millisecondsSchema,
    layout: editPlanLayoutSchema,
    caption: z.boolean(),
    zoom: editPlanZoomSchema.optional(),
  })
  .strict()
  .superRefine((clip, context) => {
    if (clip.source_end_ms <= clip.source_start_ms) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source_end_ms"],
        message: "source_end_ms must be greater than source_start_ms",
      });
    }

    if (clip.source === undefined && clip.source_asset_id === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "clip requires source or source_asset_id",
      });
    }

    if (clip.source !== undefined && clip.source_asset_id !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "clip must not contain both source and source_asset_id",
      });
    }
  });
export type EditPlanClip = z.infer<typeof editPlanClipSchema>;

/**
 * edit-plan.json is the single render input for both FFmpeg and Remotion.
 * It is intentionally free of execution details, provider requests, and LLM
 * output so a human can diff and edit it before rendering.
 */
export const editPlanSchema = z
  .object({
    version: z.literal(1),
    format: editPlanFormatSchema.default("9:16"),
    timeline: z.array(editPlanClipSchema).min(1),
  })
  .strict()
  .superRefine((plan, context) => {
    const seenIds = new Set<string>();

    for (const [index, clip] of plan.timeline.entries()) {
      if (seenIds.has(clip.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["timeline", index, "id"],
          message: "timeline clip ids must be unique",
        });
      }
      seenIds.add(clip.id);
    }
  });
export type EditPlan = z.infer<typeof editPlanSchema>;

/** Parses unknown JSON into the sole edit-plan contract. */
export function parseEditPlan(input: unknown): EditPlan {
  return editPlanSchema.parse(input);
}

export interface EditPlanDiff {
  format_changed: boolean;
  added_clip_ids: readonly string[];
  removed_clip_ids: readonly string[];
  changed_clip_ids: readonly string[];
  timeline_order_changed: boolean;
}

/**
 * Produces a compact, deterministic diff that is useful for human review and
 * tests without making a Markdown report another project fact source.
 */
export function diffEditPlans(beforeInput: unknown, afterInput: unknown): EditPlanDiff {
  const before = parseEditPlan(beforeInput);
  const after = parseEditPlan(afterInput);
  const beforeById = new Map(before.timeline.map((clip) => [clip.id, clip]));
  const afterById = new Map(after.timeline.map((clip) => [clip.id, clip]));
  const addedClipIds = after.timeline
    .filter((clip) => !beforeById.has(clip.id))
    .map((clip) => clip.id);
  const removedClipIds = before.timeline
    .filter((clip) => !afterById.has(clip.id))
    .map((clip) => clip.id);
  const changedClipIds = after.timeline
    .filter((clip) => {
      const beforeClip = beforeById.get(clip.id);
      return beforeClip !== undefined && JSON.stringify(beforeClip) !== JSON.stringify(clip);
    })
    .map((clip) => clip.id);

  return {
    format_changed: before.format !== after.format,
    added_clip_ids: addedClipIds,
    removed_clip_ids: removedClipIds,
    changed_clip_ids: changedClipIds,
    timeline_order_changed:
      before.timeline.map((clip) => clip.id).join("\u0000") !== after.timeline.map((clip) => clip.id).join("\u0000"),
  };
}
