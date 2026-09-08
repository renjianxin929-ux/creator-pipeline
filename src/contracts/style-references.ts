import { z } from "zod";

import { brandVersionSchema } from "./brand.js";
import { motionIdSchema, visualChoiceSchema } from "./director.js";
import { captionRuleIdSchema, editingRuleIdSchema } from "./style-grammar.js";
import { styleLifecycleSchema } from "./style-lifecycle.js";

/**
 * P9.2C Reference Inbox + Reference Library contracts.
 *
 * Two deliberately separate stages:
 * - Inbox: low-friction capture for "this part looks/feels good" before the
 *   Founder can explain why. Minimal input is source + founder note; no
 *   taxonomy, roles, or rule links may be required.
 * - Library: formally analyzed references that serve as evidence for later
 *   style work. References are evidence only — never style truth, never a
 *   copy instruction.
 *
 * The inbox capture state machine (UNANALYZED | ANALYZED) is intentionally
 * distinct from the style lifecycle (UNSET | CANDIDATE | OBSERVED | FROZEN):
 * "whether this capture was analyzed" and "how mature a style rule is" are
 * different questions and must never share a status field.
 *
 * This file is contract only. No downloading, scraping, media analysis,
 * LLM calls, inbox-to-library promotion, or rule learning is implemented
 * here. Linked rule IDs are validated for shape against the existing P9.1 /
 * P9.2B schemas; their existence is never resolved (P9.2D / P9.4 scope).
 */

const vendorPattern = /(asta|gpt|claude|codex|hyperframes|remotion|ffmpeg|opencut|smartsub|video-?use|openmontage)/i;

export const inboxItemIdSchema = z
  .string()
  .regex(/^inbox_[a-z0-9][a-z0-9-]*$/, "inbox id must be a stable id such as inbox_001")
  .refine((value) => !vendorPattern.test(value), {
    message: "inbox id must not name a vendor, agent, or renderer",
  });
export type InboxItemId = z.infer<typeof inboxItemIdSchema>;

export const referenceIdSchema = z
  .string()
  .regex(/^ref_[a-z0-9][a-z0-9-]*$/, "reference id must be a stable id such as ref_001")
  .refine((value) => !vendorPattern.test(value), {
    message: "reference id must not name a vendor, agent, or renderer",
  });
export type ReferenceId = z.infer<typeof referenceIdSchema>;

/**
 * A stable source locator: URL, text locator, local file reference, or any
 * other stable pointer. Only the locator string is stored — never fetched,
 * downloaded, or analyzed by this contract.
 */
export const sourceLocatorSchema = z.string().trim().min(1);
export type SourceLocator = z.infer<typeof sourceLocatorSchema>;

/**
 * Optional "mm:ss" position. Timestamps may be absent entirely (images,
 * screenshots, articles, whole clips). When both ends are present, end must
 * not precede start. No timeline model beyond this ordering check.
 */
export const mediaTimestampSchema = z
  .string()
  .regex(/^\d{1,3}:[0-5][0-9]$/, "timestamp must use mm:ss such as 00:18");
export type MediaTimestamp = z.infer<typeof mediaTimestampSchema>;

function timestampToSeconds(timestamp: string): number {
  const [minutes, seconds] = timestamp.split(":").map(Number);
  return minutes! * 60 + seconds!;
}

function addTimestampRangeIssue(
  start: string | undefined,
  end: string | undefined,
  context: z.RefinementCtx,
): void {
  if (start !== undefined && end !== undefined && timestampToSeconds(end) < timestampToSeconds(start)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["timestamp_end"],
      message: "timestamp_end must not precede timestamp_start",
    });
  }
}

/* ------------------------------------------------------------------ */
/* Reference Inbox                                                     */
/* ------------------------------------------------------------------ */

/** Capture workflow state only. Never the style lifecycle. */
export const inboxStatusValues = ["UNANALYZED", "ANALYZED"] as const;
export const inboxStatusSchema = z.enum(inboxStatusValues);
export type InboxStatus = z.infer<typeof inboxStatusSchema>;

export const referenceInboxItemSchema = z
  .object({
    id: inboxItemIdSchema,
    source: sourceLocatorSchema,
    timestamp_start: mediaTimestampSchema.optional(),
    timestamp_end: mediaTimestampSchema.optional(),
    founder_note: z.string().trim().min(1),
    status: inboxStatusSchema,
  })
  .strict()
  .superRefine((item, context) => {
    addTimestampRangeIssue(item.timestamp_start, item.timestamp_end, context);
  });
export type ReferenceInboxItem = z.infer<typeof referenceInboxItemSchema>;

export const REFERENCE_INBOX_RELATIVE_PATH = "style/reference-inbox.json";

export const referenceInboxFileSchema = z
  .object({
    version: z.literal(1),
    style_version: brandVersionSchema,
    items: z.array(referenceInboxItemSchema).default([]),
  })
  .strict()
  .superRefine((file, context) => {
    const seen = new Set<string>();
    for (const [index, item] of file.items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "id"],
          message: "inbox ids must be unique",
        });
      }
      seen.add(item.id);
    }
  });
export type ReferenceInboxFile = z.infer<typeof referenceInboxFileSchema>;

/** Parses unknown JSON into the reference-inbox file contract. */
export function parseReferenceInboxFile(input: unknown): ReferenceInboxFile {
  return referenceInboxFileSchema.parse(input);
}

/* ------------------------------------------------------------------ */
/* Reference Library                                                   */
/* ------------------------------------------------------------------ */

/**
 * Who produced the analysis. AGENT_ANALYSIS is an unapproved proposal, never
 * Founder-approved style truth. No concrete agent is named anywhere.
 */
export const referenceProvenanceValues = ["FOUNDER", "MANUAL_ANALYSIS", "AGENT_ANALYSIS"] as const;
export const referenceProvenanceSchema = z.enum(referenceProvenanceValues);
export type ReferenceProvenance = z.infer<typeof referenceProvenanceSchema>;

export const referenceItemSchema = z
  .object({
    id: referenceIdSchema,
    source: sourceLocatorSchema,
    timestamp_start: mediaTimestampSchema.optional(),
    timestamp_end: mediaTimestampSchema.optional(),
    category: z.string().trim().min(1),
    description: z.string().trim().min(1),
    founder_note: z.string().trim().min(1),
    why_saved: z.string().trim().min(1),
    reusable_aspects: z.array(z.string().trim().min(1)).min(1),
    do_not_copy: z.array(z.string().trim().min(1)).default([]),
    linked_editing_rule_ids: z.array(editingRuleIdSchema).default([]),
    linked_visual_ids: z.array(visualChoiceSchema).default([]),
    linked_motion_ids: z.array(motionIdSchema).default([]),
    linked_caption_rule_ids: z.array(captionRuleIdSchema).default([]),
    status: styleLifecycleSchema,
    provenance: referenceProvenanceSchema,
  })
  .strict()
  .superRefine((item, context) => {
    addTimestampRangeIssue(item.timestamp_start, item.timestamp_end, context);
  });
export type ReferenceItem = z.infer<typeof referenceItemSchema>;

export const REFERENCES_RELATIVE_PATH = "style/references.json";

export const referencesFileSchema = z
  .object({
    version: z.literal(1),
    style_version: brandVersionSchema,
    items: z.array(referenceItemSchema).default([]),
  })
  .strict()
  .superRefine((file, context) => {
    const seen = new Set<string>();
    for (const [index, item] of file.items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "id"],
          message: "reference ids must be unique",
        });
      }
      seen.add(item.id);
    }
  });
export type ReferencesFile = z.infer<typeof referencesFileSchema>;

/** Parses unknown JSON into the references file contract. */
export function parseReferencesFile(input: unknown): ReferencesFile {
  return referencesFileSchema.parse(input);
}
