import { z } from "zod";

import { assetManifestRecordSchema } from "./assets.js";
import { brandVersionSchema } from "./brand.js";
import {
  frozenScriptReferenceSchema,
  scriptAnchorSchema,
} from "./director.js";
import { mediaRecordSchema } from "./media.js";
import { projectSlugSchema } from "./project.js";
import {
  captionRuleSchema,
  editingRuleSchema,
  motionItemSchema,
  qualityGateSchema,
  visualPatternSchema,
} from "./style-grammar.js";
import { referenceInboxItemSchema, referenceItemSchema } from "./style-references.js";
import { transcriptDocumentSchema } from "./transcript.js";

/**
 * P9.3A Director Context contract.
 *
 * The Director Context is the work pack handed to any Director: project and
 * frozen-script identity, the verbatim script bytes, available
 * transcript/media/asset facts, lifecycle-partitioned style guidance, full
 * reference evidence, system hard constraints, and known unknowns. It is
 * structured facts plus style constraints — never a second Director Plan
 * and never a second timeline.
 *
 * No model, vendor, agent, or renderer may appear here. Prompt adaptation
 * for a concrete model belongs to that model's future provider adapter.
 */

const vendorPattern = /(asta|gpt|claude|codex|hyperframes|remotion|ffmpeg|opencut|smartsub|video-?use|openmontage)/i;

function rejectVendor(value: string): boolean {
  return !vendorPattern.test(value);
}

/* ------------------------------------------------------------------ */
/* Lifecycle-partitioned style guidance                                */
/* ------------------------------------------------------------------ */

const editingGuidanceSchema = z
  .object({ domain: z.literal("editing-grammar"), item: editingRuleSchema })
  .strict();
const visualGuidanceSchema = z
  .object({ domain: z.literal("visual-grammar"), item: visualPatternSchema })
  .strict();
const motionGuidanceSchema = z
  .object({ domain: z.literal("motion-library"), item: motionItemSchema })
  .strict();
const captionGuidanceSchema = z
  .object({ domain: z.literal("caption-rules"), item: captionRuleSchema })
  .strict();
const qualityGuidanceSchema = z
  .object({ domain: z.literal("quality-gates"), item: qualityGateSchema })
  .strict();

/**
 * One style item with its home domain attached. The stored lifecycle status
 * travels untouched inside `item`; partitioning (mandatory / strong /
 * optional) is decided by the compiler from that status alone.
 */
export const styleGuidanceItemSchema = z.discriminatedUnion("domain", [
  editingGuidanceSchema,
  visualGuidanceSchema,
  motionGuidanceSchema,
  captionGuidanceSchema,
  qualityGuidanceSchema,
]);
export type StyleGuidanceItem = z.infer<typeof styleGuidanceItemSchema>;

export const guidanceDomainValues = [
  "editing-grammar",
  "visual-grammar",
  "motion-library",
  "caption-rules",
  "quality-gates",
] as const;
export const guidanceDomainSchema = z.enum(guidanceDomainValues);
export type GuidanceDomain = z.infer<typeof guidanceDomainSchema>;

/**
 * UNSET presence registry. An UNSET item is never a Director instruction;
 * this entry only tells the Director which domains hold undecided items so
 * project-local judgment is used knowingly instead of mistaken for style.
 */
export const unknownStyleSchema = z
  .object({
    domain: guidanceDomainSchema,
    unset_item_ids: z.array(z.string().trim().min(1)),
  })
  .strict();
export type UnknownStyle = z.infer<typeof unknownStyleSchema>;

export const styleGuidanceSchema = z
  .object({
    mandatory_constraints: z.array(styleGuidanceItemSchema).default([]),
    strong_guidance: z.array(styleGuidanceItemSchema).default([]),
    optional_candidates: z.array(styleGuidanceItemSchema).default([]),
    unknown_or_unset: z.array(unknownStyleSchema).default([]),
  })
  .strict();
export type StyleGuidance = z.infer<typeof styleGuidanceSchema>;

/* ------------------------------------------------------------------ */
/* Hard constraints, known unknowns, media, output contract            */
/* ------------------------------------------------------------------ */

/**
 * System-level inviolables every Director must respect. Fixed seam
 * constants derived from the frozen product docs — not style, not taste.
 */
export const hardConstraintSchema = z
  .object({
    id: z
      .string()
      .regex(/^constraint\.[a-z0-9-]+$/, "constraint id must look like constraint.no-frozen-script-rewrite")
      .refine(rejectVendor, { message: "constraint id must not name a vendor, agent, or renderer" }),
    statement: z.string().trim().min(1),
  })
  .strict();
export type HardConstraint = z.infer<typeof hardConstraintSchema>;

export const DIRECTOR_HARD_CONSTRAINTS: readonly HardConstraint[] = [
  {
    id: "constraint.no-frozen-script-rewrite",
    statement: "The Director must not modify the Frozen Script; flag SCRIPT_VISUAL_RISK instead.",
  },
  {
    id: "constraint.no-style-invention",
    statement: "The Director must not present project-local choices as Founder-approved style.",
  },
  {
    id: "constraint.director-plan-v1-only",
    statement: "The Director must return exactly one DirectorPlan v1 for the bound project and frozen script.",
  },
  {
    id: "constraint.no-second-timeline",
    statement: "The Director must not create a second timeline; visual decisions attach to script anchors only.",
  },
] as const;

export const knownUnknownSchema = z
  .object({
    area: z.string().trim().min(1),
    detail: z.string().trim().min(1),
  })
  .strict();
export type KnownUnknown = z.infer<typeof knownUnknownSchema>;

export const mediaAvailabilitySchema = z
  .object({
    has_talking_footage: z.boolean(),
    has_screen_demo: z.boolean(),
    has_screenshot_image: z.boolean(),
    has_generated_asset: z.boolean(),
  })
  .strict();
export type MediaAvailability = z.infer<typeof mediaAvailabilitySchema>;

export const mediaAssetContextSchema = z
  .object({
    records: z.array(mediaRecordSchema).default([]),
    assets: z.array(assetManifestRecordSchema).default([]),
    availability: mediaAvailabilitySchema,
  })
  .strict();
export type MediaAssetContext = z.infer<typeof mediaAssetContextSchema>;

export const contentSummarySchema = z
  .object({
    script_lines: z.number().int().min(1),
    script_chars: z.number().int().min(1),
    transcript_segments: z.number().int().nonnegative(),
    media_records: z.number().int().nonnegative(),
    asset_records: z.number().int().nonnegative(),
  })
  .strict();
export type ContentSummary = z.infer<typeof contentSummarySchema>;

export const directorOutputContractSchema = z
  .object({
    kind: z.literal("director-plan"),
    version: z.literal(1),
  })
  .strict();
export type DirectorOutputContract = z.infer<typeof directorOutputContractSchema>;

/* ------------------------------------------------------------------ */
/* SCRIPT_VISUAL_RISK                                                  */
/* ------------------------------------------------------------------ */

export const scriptVisualRiskSeverityValues = ["low", "medium", "high"] as const;
export const scriptVisualRiskSeveritySchema = z.enum(scriptVisualRiskSeverityValues);
export type ScriptVisualRiskSeverity = z.infer<typeof scriptVisualRiskSeveritySchema>;

/**
 * A warning that script content is speakable but may lack visual carriage.
 * Advisory only: the schema carries no script-edit fields, so a risk can
 * never rewrite the Frozen Script. P9.3A defines the contract; detection
 * and plan-carriage belong to later slices.
 */
export const scriptVisualRiskSchema = z
  .object({
    id: z
      .string()
      .regex(/^risk_[a-z0-9][a-z0-9-]*$/, "risk id must be a stable id such as risk_001")
      .refine(rejectVendor, { message: "risk id must not name a vendor, agent, or renderer" }),
    type: z.literal("SCRIPT_VISUAL_RISK"),
    script_anchor: scriptAnchorSchema,
    reason: z.string().trim().min(1),
    severity: scriptVisualRiskSeveritySchema,
    suggested_action: z.string().trim().min(1).optional(),
  })
  .strict();
export type ScriptVisualRisk = z.infer<typeof scriptVisualRiskSchema>;

/* ------------------------------------------------------------------ */
/* Director Context                                                    */
/* ------------------------------------------------------------------ */

export const directorContextSchema = z
  .object({
    version: z.literal(1),
    project_slug: projectSlugSchema,
    project_id: z.string().min(1),
    frozen_script: frozenScriptReferenceSchema,
    style_version: brandVersionSchema,
    /** Verbatim frozen bytes. No trim: the text must hash to frozen_script exactly. */
    script_text: z.string().min(1),
    content_summary: contentSummarySchema,
    transcript: transcriptDocumentSchema.optional(),
    media_assets: mediaAssetContextSchema,
    style_guidance: styleGuidanceSchema,
    references: z.array(referenceItemSchema).default([]),
    reference_inbox: z.array(referenceInboxItemSchema).default([]),
    hard_constraints: z.array(hardConstraintSchema).min(1),
    known_unknowns: z.array(knownUnknownSchema).default([]),
    output_contract: directorOutputContractSchema,
    script_visual_risks: z.array(scriptVisualRiskSchema).default([]),
  })
  .strict();
export type DirectorContext = z.infer<typeof directorContextSchema>;

/** Parses unknown JSON into the sole Director Context contract. */
export function parseDirectorContext(input: unknown): DirectorContext {
  return directorContextSchema.parse(input);
}
