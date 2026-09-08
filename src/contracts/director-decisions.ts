import { z } from "zod";

import { brandVersionSchema } from "./brand.js";
import {
  captionModeSchema,
  DIRECTOR_DECISIONS_RELATIVE_PATH,
  directorSegmentSchema,
  motionIdSchema,
  semanticRoleSchema,
  visualChoiceSchema,
  type DirectorSegment,
} from "./director.js";
import { sha256Schema } from "./media.js";
import { projectSlugSchema } from "./project.js";

/**
 * P9.4A Founder Decision Dataset.
 *
 * Records what the Director proposed, what the Founder did (ACCEPT / REJECT /
 * CHANGE), why, and whether the decision is project-local or only a candidate
 * for later observation. This file is historical fact storage. It is not
 * PreviewApproval, not Style OS, and not a promotion engine.
 *
 * Official path: review/director-decisions.json
 *
 * Hard boundaries:
 * - REUSABLE_CANDIDATE means "worth observing later", never Style approved,
 *   OBSERVED, or FROZEN.
 * - Generic read/write validates schema + project identity only. Historical
 *   Preview / DirectorPlan bytes do not have to still exist as current
 *   runtime artifacts.
 * - No code path here mutates Style OS or infers ACCEPT from silence.
 */

export { DIRECTOR_DECISIONS_RELATIVE_PATH };

const vendorPattern =
  /(asta|gpt|claude|codex|hyperframes|remotion|ffmpeg|opencut|smartsub|video-?use|openmontage)/i;

const durableIdSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !vendorPattern.test(value), {
    message: "id must not name a vendor, agent, or renderer",
  });

export const founderDecisionActionValues = ["ACCEPT", "REJECT", "CHANGE"] as const;
export const founderDecisionActionSchema = z.enum(founderDecisionActionValues);
export type FounderDecisionAction = z.infer<typeof founderDecisionActionSchema>;

/**
 * Reuse intent for one Founder decision. Separate from Style lifecycle
 * (UNSET / CANDIDATE / OBSERVED / FROZEN). Nothing in this module promotes
 * either value into Style OS.
 */
export const founderReuseScopeValues = ["PROJECT_LOCAL", "REUSABLE_CANDIDATE"] as const;
export const founderReuseScopeSchema = z.enum(founderReuseScopeValues);
export type FounderReuseScope = z.infer<typeof founderReuseScopeSchema>;

/**
 * Identity of the DirectorPlan that was reviewed. Hashes are sha256 hex
 * from the shared helper; this contract stores them and never invents a
 * second digest algorithm.
 */
export const directorPlanIdentitySchema = z
  .object({
    director_plan_sha256: sha256Schema,
    frozen_script_sha256: sha256Schema,
    frozen_script_byte_size: z.number().int().nonnegative(),
    style_version: brandVersionSchema,
  })
  .strict();
export type DirectorPlanIdentity = z.infer<typeof directorPlanIdentitySchema>;

/**
 * Bytes the Founder was looking at. Not PreviewApproval: there is no
 * approved_at / approved_by, and review is legal before the approval gate.
 */
export const previewReferenceSchema = z
  .object({
    preview_path: z.string().min(1),
    preview_sha256: sha256Schema,
    edit_plan_sha256: sha256Schema.optional(),
  })
  .strict();
export type PreviewReference = z.infer<typeof previewReferenceSchema>;

const replaceOp = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z
    .object({
      op: z.literal("replace"),
      value: valueSchema,
    })
    .strict();

const unchangedOp = z.object({ op: z.literal("unchanged") }).strict();
const clearOp = z.object({ op: z.literal("clear") }).strict();

const requiredFieldPatch = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.discriminatedUnion("op", [unchangedOp, replaceOp(valueSchema)]);

const clearableFieldPatch = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.discriminatedUnion("op", [unchangedOp, clearOp, replaceOp(valueSchema)]);

/**
 * Structured partial patch for CHANGE. Omitted fields are unchanged.
 * Deletable optional fields must use unchanged / clear / replace — never a
 * bare null — so "leave it" and "delete it" cannot be confused.
 */
export const founderReplacementPatchSchema = z
  .object({
    semantic_role: requiredFieldPatch(semanticRoleSchema).optional(),
    primary_visual: requiredFieldPatch(visualChoiceSchema).optional(),
    allowed_visuals: requiredFieldPatch(z.array(visualChoiceSchema).min(1)).optional(),
    forbidden_visuals: requiredFieldPatch(z.array(visualChoiceSchema)).optional(),
    caption_mode: requiredFieldPatch(captionModeSchema).optional(),
    emphasis_text: clearableFieldPatch(z.string().trim().min(1)).optional(),
    motion_id: clearableFieldPatch(motionIdSchema).optional(),
    director_intent: clearableFieldPatch(z.string().trim().min(1)).optional(),
  })
  .strict();
export type FounderReplacementPatch = z.infer<typeof founderReplacementPatchSchema>;

function patchHasEffect(patch: FounderReplacementPatch): boolean {
  return (Object.values(patch) as Array<{ op: string } | undefined>).some(
    (field) => field !== undefined && field.op !== "unchanged",
  );
}

function assignRequired(
  target: Record<string, unknown>,
  key: string,
  patch: { op: "unchanged" } | { op: "replace"; value: unknown } | undefined,
): void {
  if (patch === undefined || patch.op === "unchanged") {
    return;
  }
  target[key] = patch.value;
}

function assignClearable(
  target: Record<string, unknown>,
  key: string,
  patch: { op: "unchanged" } | { op: "clear" } | { op: "replace"; value: unknown } | undefined,
): void {
  if (patch === undefined || patch.op === "unchanged") {
    return;
  }
  if (patch.op === "clear") {
    delete target[key];
    return;
  }
  target[key] = patch.value;
}

/**
 * Applies a Founder CHANGE patch to the Director proposal. The result is
 * re-validated by directorSegmentSchema; invalid combinations never persist
 * as a resolved segment. Pure: no IO, no Style OS writes.
 */
export function applyFounderReplacement(
  proposalInput: DirectorSegment,
  patchInput: FounderReplacementPatch,
): DirectorSegment {
  const proposal = directorSegmentSchema.parse(proposalInput);
  const patch = founderReplacementPatchSchema.parse(patchInput);
  const next: Record<string, unknown> = { ...proposal };

  assignRequired(next, "semantic_role", patch.semantic_role);
  assignRequired(next, "primary_visual", patch.primary_visual);
  assignRequired(next, "allowed_visuals", patch.allowed_visuals);
  assignRequired(next, "forbidden_visuals", patch.forbidden_visuals);
  assignRequired(next, "caption_mode", patch.caption_mode);
  assignClearable(next, "emphasis_text", patch.emphasis_text);
  assignClearable(next, "motion_id", patch.motion_id);
  assignClearable(next, "director_intent", patch.director_intent);

  return directorSegmentSchema.parse(next);
}

const decisionBase = {
  decision_id: durableIdSchema,
  segment_id: z.string().trim().min(1),
  proposal: directorSegmentSchema,
  reuse_scope: founderReuseScopeSchema,
};

const acceptDecisionSchema = z
  .object({
    ...decisionBase,
    action: z.literal("ACCEPT"),
    reason: z.string().trim().min(1).optional(),
  })
  .strict();

const rejectDecisionSchema = z
  .object({
    ...decisionBase,
    action: z.literal("REJECT"),
    reason: z.string().trim().min(1),
  })
  .strict();

const changeDecisionSchema = z
  .object({
    ...decisionBase,
    action: z.literal("CHANGE"),
    reason: z.string().trim().min(1),
    replacement: founderReplacementPatchSchema,
  })
  .strict();

export const founderDecisionSchema = z
  .discriminatedUnion("action", [acceptDecisionSchema, rejectDecisionSchema, changeDecisionSchema])
  .superRefine((decision, context) => {
    if (decision.proposal.segment_id !== decision.segment_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["segment_id"],
        message: "segment_id must match proposal.segment_id",
      });
    }
    if (decision.action !== "CHANGE") {
      return;
    }
    if (!patchHasEffect(decision.replacement)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["replacement"],
        message: "CHANGE replacement must modify at least one field",
      });
    }
    try {
      applyFounderReplacement(decision.proposal, decision.replacement);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["replacement"],
        message: "replacement must resolve to a valid DirectorSegment",
      });
    }
  });
export type FounderDecision = z.infer<typeof founderDecisionSchema>;

export const founderReviewSessionSchema = z
  .object({
    review_id: durableIdSchema,
    director_plan_identity: directorPlanIdentitySchema,
    preview_reference: previewReferenceSchema,
    decisions: z.array(founderDecisionSchema).min(1),
  })
  .strict();
export type FounderReviewSession = z.infer<typeof founderReviewSessionSchema>;

export const founderDecisionDatasetSchema = z
  .object({
    version: z.literal(1),
    project_slug: projectSlugSchema,
    project_id: z.string().min(1),
    reviews: z.array(founderReviewSessionSchema).default([]),
  })
  .strict()
  .superRefine((dataset, context) => {
    const reviewIds = new Set<string>();
    const decisionIds = new Set<string>();

    for (const [reviewIndex, review] of dataset.reviews.entries()) {
      if (reviewIds.has(review.review_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reviews", reviewIndex, "review_id"],
          message: "review_id must be unique in the dataset",
        });
      }
      reviewIds.add(review.review_id);

      for (const [decisionIndex, decision] of review.decisions.entries()) {
        if (decisionIds.has(decision.decision_id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reviews", reviewIndex, "decisions", decisionIndex, "decision_id"],
            message: "decision_id must be unique across the dataset",
          });
        }
        decisionIds.add(decision.decision_id);
      }
    }
  });
export type FounderDecisionDataset = z.infer<typeof founderDecisionDatasetSchema>;

export function parseFounderDecisionDataset(input: unknown): FounderDecisionDataset {
  return founderDecisionDatasetSchema.parse(input);
}
