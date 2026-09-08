import { z } from "zod";

import { brandVersionSchema } from "./brand.js";
import { sha256Schema } from "./media.js";
import { projectSlugSchema } from "./project.js";

/**
 * P9.1 Director + Style contracts.
 *
 * Layer separation (frozen by the Founder decision):
 * - Frozen Script = content truth ("what is said").
 * - Director Plan = visual interpretation ("what the viewer should see").
 * - Edit Plan = executable timeline ("how it is cut").
 *
 * This file defines contracts and persistence boundaries only. It performs no
 * LLM calls, no rendering, and no style-rule learning. Full Style OS grammars
 * belong to P9.2; the planner seam belongs to P9.3; the review loop belongs
 * to P9.4.
 */

export const FROZEN_SCRIPT_RELATIVE_PATH = "content/frozen-script.md";
export const DIRECTOR_PLAN_RELATIVE_PATH = "plans/director-plan.json";
/**
 * P9.1 keeps only a minimal persistence envelope for this path. The full
 * Founder Decision Dataset is P9.4 scope and must not be built here.
 */
export const DIRECTOR_DECISIONS_RELATIVE_PATH = "review/director-decisions.json";

export const semanticRoleValues = [
  "HOOK",
  "CLAIM",
  "PROBLEM",
  "PROOF",
  "DEMO_ACTION",
  "RESULT",
  "CONTRAST",
  "CONCEPT",
  "TRANSITION",
  "CTA",
] as const;
export const semanticRoleSchema = z.enum(semanticRoleValues);
export type SemanticRole = z.infer<typeof semanticRoleSchema>;

/**
 * Stable visual-choice identifiers, decoupled from any agent or renderer.
 * Good: `visual.proof.real-demo`. Bad: `hyperframes_zoom_v2`,
 * `claude_proof_animation`, `renderer_specific_component_17`.
 * Underscores are rejected so renderer-style snake_case names cannot pass.
 */
const vendorPattern = /(asta|gpt|claude|codex|hyperframes|remotion|ffmpeg|opencut|smartsub|video-?use|openmontage)/i;
const visualChoicePattern = /^visual\.[a-z0-9]+(?:\.[a-z0-9-]+)+$/;
export const visualChoiceSchema = z
  .string()
  .regex(visualChoicePattern, "visual choice must be a stable namespaced id such as visual.proof.real-demo")
  .refine((value) => !vendorPattern.test(value), {
    message: "visual choice must not name a vendor, agent, or renderer",
  });
export type VisualChoice = z.infer<typeof visualChoiceSchema>;

/** Stable motion identifiers (e.g. `motion.evidence-highlight`). Same vendor ban. */
const motionIdPattern = /^motion\.[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;
export const motionIdSchema = z
  .string()
  .regex(motionIdPattern, "motion id must be a stable namespaced id such as motion.evidence-highlight")
  .refine((value) => !vendorPattern.test(value), {
    message: "motion id must not name a vendor, agent, or renderer",
  });
export type MotionId = z.infer<typeof motionIdSchema>;

export const captionModeValues = ["none", "default", "emphasis", "quote"] as const;
export const captionModeSchema = z.enum(captionModeValues);
export type CaptionMode = z.infer<typeof captionModeSchema>;

/**
 * P9.1 Style boundary: the Director Plan only references a versioned style.
 * Editing/visual/motion/caption grammars, reference libraries, and quality
 * gates are P9.2 scope and must not be defined here.
 */
export const styleReferenceSchema = z
  .object({
    style_version: brandVersionSchema,
  })
  .strict();
export type StyleReference = z.infer<typeof styleReferenceSchema>;

/**
 * Deterministic Frozen Script identity. The hash is computed over the exact
 * persisted bytes of `content/frozen-script.md`, never over filenames,
 * mtimes, or prose descriptions.
 */
export const frozenScriptReferenceSchema = z
  .object({
    path: z.literal(FROZEN_SCRIPT_RELATIVE_PATH),
    sha256: sha256Schema,
    byte_size: z.number().int().nonnegative(),
  })
  .strict();
export type FrozenScriptReference = z.infer<typeof frozenScriptReferenceSchema>;

/** Structured anchor into the frozen script (1-indexed inclusive line range). */
export const scriptAnchorSchema = z
  .object({
    start_line: z.number().int().min(1),
    end_line: z.number().int().min(1),
  })
  .strict()
  .superRefine((anchor, context) => {
    if (anchor.end_line < anchor.start_line) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_line"],
        message: "end_line must be greater than or equal to start_line",
      });
    }
  });
export type ScriptAnchor = z.infer<typeof scriptAnchorSchema>;

const millisecondsSchema = z.number().int().nonnegative();

/**
 * Optional transcript/time range. It may only be set when a real timed source
 * exists; callers must never fabricate timings to fill this field.
 */
export const directorTimeRangeSchema = z
  .object({
    start_ms: millisecondsSchema,
    end_ms: millisecondsSchema,
  })
  .strict()
  .superRefine((range, context) => {
    if (range.end_ms <= range.start_ms) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_ms"],
        message: "end_ms must be greater than start_ms",
      });
    }
  });
export type DirectorTimeRange = z.infer<typeof directorTimeRangeSchema>;

export const directorSegmentSchema = z
  .object({
    segment_id: z.string().trim().min(1),
    script_anchor: scriptAnchorSchema,
    source_range_ms: directorTimeRangeSchema.optional(),
    semantic_role: semanticRoleSchema,
    primary_visual: visualChoiceSchema,
    allowed_visuals: z.array(visualChoiceSchema).min(1),
    forbidden_visuals: z.array(visualChoiceSchema).default([]),
    caption_mode: captionModeSchema,
    emphasis_text: z.string().trim().min(1).optional(),
    motion_id: motionIdSchema.optional(),
    director_intent: z.string().trim().min(1).optional(),
    reason: z.string().trim().min(1),
    confidence: z.number().min(0).max(1),
  })
  .strict()
  .superRefine((segment, context) => {
    if (!segment.allowed_visuals.includes(segment.primary_visual)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["primary_visual"],
        message: "primary_visual must be one of allowed_visuals",
      });
    }

    const forbidden = new Set(segment.forbidden_visuals);
    for (const [index, visual] of segment.allowed_visuals.entries()) {
      if (forbidden.has(visual)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allowed_visuals", index],
          message: "allowed_visuals and forbidden_visuals must not overlap",
        });
      }
    }

    if (segment.caption_mode === "emphasis" && segment.emphasis_text === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["emphasis_text"],
        message: "emphasis_text is required when caption_mode is emphasis",
      });
    }

    if (
      (segment.caption_mode === "none" || segment.caption_mode === "default") &&
      segment.emphasis_text !== undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["emphasis_text"],
        message: "emphasis_text requires caption_mode emphasis or quote",
      });
    }
  });
export type DirectorSegment = z.infer<typeof directorSegmentSchema>;

/**
 * The Director Plan is a derived visual-execution contract attached to one
 * exact Frozen Script identity. It is not a second timeline and it carries
 * no renderer execution details.
 */
export const directorPlanSchema = z
  .object({
    version: z.literal(1),
    project_slug: projectSlugSchema,
    frozen_script: frozenScriptReferenceSchema,
    style_reference: styleReferenceSchema,
    segments: z.array(directorSegmentSchema).min(1),
    created_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((plan, context) => {
    const seenIds = new Set<string>();

    for (const [index, segment] of plan.segments.entries()) {
      if (seenIds.has(segment.segment_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "segment_id"],
          message: "segment ids must be unique",
        });
      }
      seenIds.add(segment.segment_id);
    }
  });
export type DirectorPlan = z.infer<typeof directorPlanSchema>;

/** Parses unknown JSON into the sole Director Plan contract. */
export function parseDirectorPlan(input: unknown): DirectorPlan {
  return directorPlanSchema.parse(input);
}

/**
 * Compares a plan against the current Frozen Script hash. Any byte change in
 * the frozen script deterministically marks previously valid plans stale.
 */
export function isDirectorPlanStale(planInput: DirectorPlan, currentFrozenSha256: string): boolean {
  const plan = directorPlanSchema.parse(planInput);
  const current = sha256Schema.parse(currentFrozenSha256);
  return plan.frozen_script.sha256 !== current;
}

export const directorDecisionActionValues = ["ACCEPT", "REJECT", "CHANGE"] as const;
export const directorDecisionActionSchema = z.enum(directorDecisionActionValues);
export type DirectorDecisionAction = z.infer<typeof directorDecisionActionSchema>;

/**
 * Minimal P9.1 persistence record for `review/director-decisions.json`.
 * Only the envelope and project/frozen-script linkage are frozen here so
 * P9.4 can build the full review loop, metrics, and promotion gates on top.
 */
export const directorDecisionRecordSchema = z
  .object({
    segment_id: z.string().trim().min(1),
    action: directorDecisionActionSchema,
    reason: z.string().trim().min(1).optional(),
    replacement_visual: visualChoiceSchema.optional(),
  })
  .strict();
export type DirectorDecisionRecord = z.infer<typeof directorDecisionRecordSchema>;

export const directorDecisionsFileSchema = z
  .object({
    version: z.literal(1),
    project_slug: projectSlugSchema,
    director_frozen_script_sha256: sha256Schema,
    decisions: z.array(directorDecisionRecordSchema).default([]),
  })
  .strict();
export type DirectorDecisionsFile = z.infer<typeof directorDecisionsFileSchema>;

/** Parses unknown JSON into the minimal P9.1 decisions envelope. */
export function parseDirectorDecisionsFile(input: unknown): DirectorDecisionsFile {
  return directorDecisionsFileSchema.parse(input);
}
