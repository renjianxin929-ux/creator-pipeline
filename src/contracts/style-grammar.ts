import { z } from "zod";

import { brandVersionSchema } from "./brand.js";
import { motionIdSchema, semanticRoleSchema, visualChoiceSchema } from "./director.js";
import { styleDomainSchema, styleLifecycleSchema } from "./style-lifecycle.js";

/**
 * P9.2B Grammar domain contracts.
 *
 * This file defines how REN style *can be expressed* — never what REN style
 * *is*. Every item carries its own lifecycle status (UNSET | CANDIDATE |
 * OBSERVED | FROZEN); domains themselves have no lifecycle. Only the
 * Founder's explicit confirmation may produce a FROZEN item, so this file
 * contains no promotion, aggregation, or learning logic of any kind. Those
 * remain P9.4 scope. Reference structures remain P9.2C scope; evidence_refs
 * below are opaque stable strings and are never resolved here.
 *
 * Identity rules: durable IDs are namespaced per domain (editing.*,
 * visual.*, motion.*, caption.*, quality.*) and vendor/renderer
 * independent. Visual and motion IDs reuse the exact P9.1 Director Plan
 * identifiers — no second ID system is introduced.
 */

const vendorPattern = /(asta|gpt|claude|codex|hyperframes|remotion|ffmpeg|opencut|smartsub|video-?use|openmontage)/i;

function namespacedId(namespace: string, example: string) {
  return z
    .string()
    .regex(
      new RegExp(`^${namespace}\\.[a-z0-9]+(?:\\.[a-z0-9-]+)+$`),
      `style id must be a stable namespaced id such as ${example}`,
    )
    .refine((value) => !vendorPattern.test(value), {
      message: "style id must not name a vendor, agent, or renderer",
    });
}

export const editingRuleIdSchema = namespacedId("editing", "editing.proof.real-evidence-first");
export type EditingRuleId = z.infer<typeof editingRuleIdSchema>;

export const captionRuleIdSchema = namespacedId("caption", "caption.demo.quiet-lower-third");
export type CaptionRuleId = z.infer<typeof captionRuleIdSchema>;

export const qualityRuleIdSchema = namespacedId("quality", "quality.proof.no-decorative-cover");
export type QualityRuleId = z.infer<typeof qualityRuleIdSchema>;

/** Opaque stable reference pointer. P9.2C owns the Reference Library; existence is never checked here. */
export const evidenceRefSchema = z.string().trim().min(1);
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

function addDisjointIssue(
  allowed: readonly string[],
  forbidden: readonly string[],
  context: z.RefinementCtx,
  allowedPath: string,
): void {
  const blocked = new Set(forbidden);
  for (const [index, value] of allowed.entries()) {
    if (blocked.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [allowedPath, index],
        message: "allowed and forbidden entries must not overlap",
      });
    }
  }
}

function uniqueItemIds<TItem extends { id: string }>(
  items: readonly TItem[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items", index, "id"],
        message: "item ids must be unique within a domain file",
      });
    }
    seen.add(item.id);
  }
}

/* ------------------------------------------------------------------ */
/* Editing Grammar                                                     */
/* ------------------------------------------------------------------ */

/**
 * A semantic editing rule (never a timing rule such as "cut every
 * 3 seconds"). Describes which visual carriers a semantic role prefers or
 * refuses, and why.
 */
export const editingRuleSchema = z
  .object({
    id: editingRuleIdSchema,
    status: styleLifecycleSchema,
    applies_to: z.array(semanticRoleSchema).min(1),
    rule: z.string().trim().min(1),
    allowed_visuals: z.array(visualChoiceSchema).min(1),
    forbidden_visuals: z.array(visualChoiceSchema).default([]),
    allowed_motion_ids: z.array(motionIdSchema).default([]),
    forbidden_motion_ids: z.array(motionIdSchema).default([]),
    why: z.string().trim().min(1),
    evidence_refs: z.array(evidenceRefSchema).default([]),
  })
  .strict()
  .superRefine((rule, context) => {
    addDisjointIssue(rule.allowed_visuals, rule.forbidden_visuals, context, "allowed_visuals");
    addDisjointIssue(rule.allowed_motion_ids, rule.forbidden_motion_ids, context, "allowed_motion_ids");
  });
export type EditingRule = z.infer<typeof editingRuleSchema>;

export const EDITING_GRAMMAR_RELATIVE_PATH = "style/editing-grammar.json";

export const editingGrammarFileSchema = z
  .object({
    version: z.literal(1),
    style_version: brandVersionSchema,
    items: z.array(editingRuleSchema).default([]),
  })
  .strict()
  .superRefine((file, context) => {
    uniqueItemIds(file.items, context);
  });
export type EditingGrammarFile = z.infer<typeof editingGrammarFileSchema>;

/** Parses unknown JSON into the editing-grammar file contract. */
export function parseEditingGrammarFile(input: unknown): EditingGrammarFile {
  return editingGrammarFileSchema.parse(input);
}

/* ------------------------------------------------------------------ */
/* Visual Grammar                                                      */
/* ------------------------------------------------------------------ */

export const visualDensityValues = ["sparse", "balanced", "dense"] as const;
export const visualDensitySchema = z.enum(visualDensityValues);
export type VisualDensity = z.infer<typeof visualDensitySchema>;

/**
 * A reusable visual pattern: what it is and when it fits — never the final
 * aesthetic implementation. Fonts, colors, positioning, motion timing, and
 * any CSS/Remotion/HyperFrames implementation must stay out; when the look
 * is undecided, implementation_status remains UNSET.
 */
export const visualPatternSchema = z
  .object({
    id: visualChoiceSchema,
    status: styleLifecycleSchema,
    purpose: z.string().trim().min(1),
    applicable_roles: z.array(semanticRoleSchema).min(1),
    layout_intent: z.string().trim().min(1),
    information_density: visualDensitySchema.optional(),
    title_allowed: z.boolean(),
    caption_allowed: z.boolean(),
    motion_allowed: z.boolean(),
    forbidden_behaviors: z.array(z.string().trim().min(1)).default([]),
    implementation_status: styleLifecycleSchema,
  })
  .strict();
export type VisualPattern = z.infer<typeof visualPatternSchema>;

export const VISUAL_GRAMMAR_RELATIVE_PATH = "style/visual-grammar.json";

export const visualGrammarFileSchema = z
  .object({
    version: z.literal(1),
    style_version: brandVersionSchema,
    items: z.array(visualPatternSchema).default([]),
  })
  .strict()
  .superRefine((file, context) => {
    uniqueItemIds(file.items, context);
  });
export type VisualGrammarFile = z.infer<typeof visualGrammarFileSchema>;

/** Parses unknown JSON into the visual-grammar file contract. */
export function parseVisualGrammarFile(input: unknown): VisualGrammarFile {
  return visualGrammarFileSchema.parse(input);
}

/* ------------------------------------------------------------------ */
/* Motion Grammar                                                      */
/* ------------------------------------------------------------------ */

/**
 * A motion vocabulary entry: purpose only, never renderer execution. A known
 * concept whose look is undecided is expressed as status UNSET with
 * implementation_status UNSET.
 */
export const motionItemSchema = z
  .object({
    id: motionIdSchema,
    status: styleLifecycleSchema,
    purpose: z.string().trim().min(1),
    applicable_roles: z.array(semanticRoleSchema).default([]),
    forbidden_roles: z.array(semanticRoleSchema).default([]),
    implementation_status: styleLifecycleSchema,
    notes: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((item, context) => {
    addDisjointIssue(item.applicable_roles, item.forbidden_roles, context, "applicable_roles");
  });
export type MotionItem = z.infer<typeof motionItemSchema>;

export const MOTION_LIBRARY_RELATIVE_PATH = "style/motion-library.json";

export const motionLibraryFileSchema = z
  .object({
    version: z.literal(1),
    style_version: brandVersionSchema,
    items: z.array(motionItemSchema).default([]),
  })
  .strict()
  .superRefine((file, context) => {
    uniqueItemIds(file.items, context);
  });
export type MotionLibraryFile = z.infer<typeof motionLibraryFileSchema>;

/** Parses unknown JSON into the motion-library file contract. */
export function parseMotionLibraryFile(input: unknown): MotionLibraryFile {
  return motionLibraryFileSchema.parse(input);
}

/* ------------------------------------------------------------------ */
/* Caption Grammar                                                     */
/* ------------------------------------------------------------------ */

/**
 * Caption behavior rules — never ASR. Recognition providers (FunASR,
 * SmartSub, Whisper, or any other) must not appear here, and unapproved
 * typography (font, size, color, animation) has no field to live in.
 * Unknown aesthetics are expressed by omitting the optional bounds.
 */
export const captionRuleSchema = z
  .object({
    id: captionRuleIdSchema,
    status: styleLifecycleSchema,
    rule: z.string().trim().min(1),
    applicable_roles: z.array(semanticRoleSchema).optional(),
    semantic_chunking: z.string().trim().min(1).optional(),
    max_lines: z.number().int().min(1).optional(),
    emphasis_max_words: z.number().int().min(1).optional(),
    demo_safe_area: z.string().trim().min(1).optional(),
    prohibited_behaviors: z.array(z.string().trim().min(1)).default([]),
    evidence_refs: z.array(evidenceRefSchema).default([]),
  })
  .strict();
export type CaptionRule = z.infer<typeof captionRuleSchema>;

export const CAPTION_RULES_RELATIVE_PATH = "style/caption-rules.json";

export const captionRulesFileSchema = z
  .object({
    version: z.literal(1),
    style_version: brandVersionSchema,
    items: z.array(captionRuleSchema).default([]),
  })
  .strict()
  .superRefine((file, context) => {
    uniqueItemIds(file.items, context);
  });
export type CaptionRulesFile = z.infer<typeof captionRulesFileSchema>;

/** Parses unknown JSON into the caption-rules file contract. */
export function parseCaptionRulesFile(input: unknown): CaptionRulesFile {
  return captionRulesFileSchema.parse(input);
}

/* ------------------------------------------------------------------ */
/* Quality Gates                                                       */
/* ------------------------------------------------------------------ */

export const qualitySeverityValues = ["HARD", "ADVISORY"] as const;
export const qualitySeveritySchema = z.enum(qualitySeverityValues);
export type QualitySeverity = z.infer<typeof qualitySeveritySchema>;

/**
 * A hard prohibition or required check — never a taste score. severity
 * (HARD vs ADVISORY) is independent of lifecycle status: a CANDIDATE rule
 * may already be shaped as a future HARD gate, but nothing here executes
 * gates against Director Plans or renders. No gate runtime is implemented
 * in P9.2B.
 */
export const qualityGateSchema = z
  .object({
    id: qualityRuleIdSchema,
    status: styleLifecycleSchema,
    severity: qualitySeveritySchema,
    applies_to_roles: z.array(semanticRoleSchema).optional(),
    applies_to_domains: z.array(styleDomainSchema).optional(),
    rule: z.string().trim().min(1),
    reason: z.string().trim().min(1),
    evidence_refs: z.array(evidenceRefSchema).default([]),
  })
  .strict();
export type QualityGate = z.infer<typeof qualityGateSchema>;

export const QUALITY_GATES_RELATIVE_PATH = "style/quality-gates.json";

export const qualityGatesFileSchema = z
  .object({
    version: z.literal(1),
    style_version: brandVersionSchema,
    items: z.array(qualityGateSchema).default([]),
  })
  .strict()
  .superRefine((file, context) => {
    uniqueItemIds(file.items, context);
  });
export type QualityGatesFile = z.infer<typeof qualityGatesFileSchema>;

/** Parses unknown JSON into the quality-gates file contract. */
export function parseQualityGatesFile(input: unknown): QualityGatesFile {
  return qualityGatesFileSchema.parse(input);
}

/* ------------------------------------------------------------------ */
/* Domain correspondence                                               */
/* ------------------------------------------------------------------ */

/**
 * Static one-to-one correspondence between manifest domain keys, their
 * expected file paths, and the schema that must parse them. This is data,
 * not a loader: it lets callers (and P9.2D) refuse mismatched pairs such
 * as an editing-grammar key pointing at motion-library content.
 */
export const styleGrammarFileSchemas = {
  "editing-grammar": editingGrammarFileSchema,
  "visual-grammar": visualGrammarFileSchema,
  "motion-library": motionLibraryFileSchema,
  "caption-rules": captionRulesFileSchema,
  "quality-gates": qualityGatesFileSchema,
} as const;

export const styleGrammarFilePaths = {
  "editing-grammar": EDITING_GRAMMAR_RELATIVE_PATH,
  "visual-grammar": VISUAL_GRAMMAR_RELATIVE_PATH,
  "motion-library": MOTION_LIBRARY_RELATIVE_PATH,
  "caption-rules": CAPTION_RULES_RELATIVE_PATH,
  "quality-gates": QUALITY_GATES_RELATIVE_PATH,
} as const;
