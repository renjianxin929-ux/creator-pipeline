import { z } from "zod";

import { brandVersionSchema } from "./brand.js";
import {
  captionRulesFileSchema,
  editingGrammarFileSchema,
  motionLibraryFileSchema,
  qualityGatesFileSchema,
  visualGrammarFileSchema,
  type CaptionRule,
  type CaptionRulesFile,
  type EditingGrammarFile,
  type EditingRule,
  type MotionItem,
  type MotionLibraryFile,
  type QualityGate,
  type QualityGatesFile,
  type VisualGrammarFile,
  type VisualPattern,
} from "./style-grammar.js";
import {
  referenceInboxFileSchema,
  referencesFileSchema,
  type ReferenceInboxFile,
  type ReferenceInboxItem,
  type ReferenceItem,
  type ReferencesFile,
} from "./style-references.js";
import { styleLifecycleSchema, type StyleLifecycleStatus } from "./style-lifecycle.js";

/**
 * P9.2D Resolved Style OS snapshot contract.
 *
 * The snapshot answers "which style assets exist right now" for downstream
 * P9.3 consumption. It never decides how a video is cut, never changes a
 * lifecycle status, and never computes an aggregate style status. Every
 * item keeps the exact status it was stored with.
 */

/** A parsed grammar/reference domain file with zero stored items. */
export function emptyDomainFile(styleVersion: string): {
  version: 1;
  style_version: string;
  items: [];
} {
  return { version: 1, style_version: styleVersion, items: [] };
}

export const styleOsSnapshotSchema = z
  .object({
    style_version: brandVersionSchema,
    brand_version: brandVersionSchema,
    editing_grammar: editingGrammarFileSchema,
    visual_grammar: visualGrammarFileSchema,
    motion_library: motionLibraryFileSchema,
    caption_rules: captionRulesFileSchema,
    quality_gates: qualityGatesFileSchema,
    references: referencesFileSchema,
    reference_inbox: referenceInboxFileSchema,
  })
  .strict();
export type StyleOsSnapshot = z.infer<typeof styleOsSnapshotSchema>;

/** Parses unknown JSON into the Style OS snapshot contract. */
export function parseStyleOsSnapshot(input: unknown): StyleOsSnapshot {
  return styleOsSnapshotSchema.parse(input);
}

export type {
  CaptionRule,
  CaptionRulesFile,
  EditingGrammarFile,
  EditingRule,
  MotionItem,
  MotionLibraryFile,
  QualityGate,
  QualityGatesFile,
  ReferenceInboxFile,
  ReferenceInboxItem,
  ReferenceItem,
  ReferencesFile,
  VisualGrammarFile,
  VisualPattern,
};

/* ------------------------------------------------------------------ */
/* Lifecycle query boundary for P9.3                                   */
/* ------------------------------------------------------------------ */

/**
 * Read-only status filters for downstream consumers. All three preserve
 * every item's stored status and mutate nothing:
 * - FROZEN items are the only durable Founder truth.
 * - OBSERVED items are strong evidence / recommendations only.
 * - CANDIDATE items are optional suggestions only.
 * - UNSET items must never be represented as a REN preference — even when
 *   their rule text is specific. They are known placeholders for unknown
 *   preferences (see the P9.2B architect note).
 */
export function selectItemsByStatus<TItem extends { status: StyleLifecycleStatus }>(
  items: readonly TItem[],
  status: StyleLifecycleStatus,
): TItem[] {
  const parsed = styleLifecycleSchema.parse(status);
  return items.filter((item) => item.status === parsed);
}

/** Durable Founder truth: FROZEN items only. */
export function selectDurableTruth<TItem extends { status: StyleLifecycleStatus }>(
  items: readonly TItem[],
): TItem[] {
  return selectItemsByStatus(items, "FROZEN");
}

/**
 * REN preferences: every item except UNSET. An UNSET item — however
 * specific its text — is always excluded.
 */
export function selectRenPreferences<TItem extends { status: StyleLifecycleStatus }>(
  items: readonly TItem[],
): TItem[] {
  return items.filter((item) => item.status !== "UNSET");
}
