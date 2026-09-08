import {
  DIRECTOR_HARD_CONSTRAINTS,
  directorContextSchema,
  parseDirectorContext,
  type DirectorContext,
  type GuidanceDomain,
  type StyleGuidanceItem,
} from "../contracts/index.js";
import {
  assetManifestRecordSchema,
  type AssetManifestRecord,
} from "../contracts/index.js";
import { brandVersionSchema } from "../contracts/index.js";
import { sha256Schema } from "../contracts/index.js";
import { mediaRecordSchema, type MediaRecord } from "../contracts/index.js";
import {
  projectIdentitySchema,
  type ProjectIdentity,
} from "../contracts/index.js";
import {
  styleOsSnapshotSchema,
  type StyleOsSnapshot,
} from "../contracts/index.js";
import {
  transcriptDocumentSchema,
  type TranscriptDocument,
} from "../contracts/index.js";
import { sha256Bytes } from "../project/file-hash.js";

export class DirectorContextError extends Error {
  override name = "DirectorContextError";
}

export interface CompileDirectorContextInput {
  project: ProjectIdentity;
  /** Exact frozen-script bytes as text. The compiler hashes these verbatim. */
  frozenScriptText: string;
  styleSnapshot: StyleOsSnapshot;
  transcript?: TranscriptDocument;
  mediaRecords?: readonly MediaRecord[];
  assetRecords?: readonly AssetManifestRecord[];
}

const GUIDANCE_DOMAINS: readonly GuidanceDomain[] = [
  "editing-grammar",
  "visual-grammar",
  "motion-library",
  "caption-rules",
  "quality-gates",
];

/**
 * Compiles a deterministic Director work pack from project identity,
 * frozen-script bytes, style snapshot, and available media facts. Pure:
 * same inputs always produce a structurally equal context, with no model,
 * no randomness, and no summarization.
 */
export function compileDirectorContext(input: CompileDirectorContextInput): DirectorContext {
  const project = projectIdentitySchema.parse(input.project);
  const snapshot = styleOsSnapshotSchema.parse(input.styleSnapshot);
  const transcript =
    input.transcript === undefined ? undefined : transcriptDocumentSchema.parse(input.transcript);
  const mediaRecords = (input.mediaRecords ?? []).map((record) => mediaRecordSchema.parse(record));
  const assetRecords = (input.assetRecords ?? []).map((record) =>
    assetManifestRecordSchema.parse(record),
  );

  if (input.frozenScriptText.trim().length === 0) {
    throw new DirectorContextError("Frozen script text must not be empty");
  }
  const scriptBytes = Buffer.from(input.frozenScriptText, "utf8");
  const frozenIdentity = {
    path: "content/frozen-script.md",
    sha256: sha256Bytes(scriptBytes),
    byte_size: scriptBytes.byteLength,
  };

  const mandatory: StyleGuidanceItem[] = [];
  const advisories: StyleGuidanceItem[] = [];
  const strong: StyleGuidanceItem[] = [];
  const optional: StyleGuidanceItem[] = [];
  const unknownOrUnset: DirectorContext["style_guidance"]["unknown_or_unset"] = [];

  const domainItems: Record<GuidanceDomain, StyleGuidanceItem[]> = {
    "editing-grammar": snapshot.editing_grammar.items.map((item) => ({
      domain: "editing-grammar" as const,
      item,
    })),
    "visual-grammar": snapshot.visual_grammar.items.map((item) => ({
      domain: "visual-grammar" as const,
      item,
    })),
    "motion-library": snapshot.motion_library.items.map((item) => ({
      domain: "motion-library" as const,
      item,
    })),
    "caption-rules": snapshot.caption_rules.items.map((item) => ({
      domain: "caption-rules" as const,
      item,
    })),
    "quality-gates": snapshot.quality_gates.items.map((item) => ({
      domain: "quality-gates" as const,
      item,
    })),
  };

  for (const domain of GUIDANCE_DOMAINS) {
    const unsetIds: string[] = [];
    for (const entry of domainItems[domain]) {
      // Lifecycle and severity stay orthogonal. The stored status alone
      // decides the tier, and severity never upgrades it: FROZEN is the only
      // path into mandatory, and only with HARD severity — a FROZEN
      // ADVISORY gate is approved guidance, not a hard constraint.
      if (entry.item.status === "FROZEN") {
        if (entry.domain === "quality-gates" && entry.item.severity === "ADVISORY") {
          advisories.push(entry);
        } else {
          mandatory.push(entry);
        }
      } else if (entry.item.status === "OBSERVED") {
        strong.push(entry);
      } else if (entry.item.status === "CANDIDATE") {
        optional.push(entry);
      } else {
        unsetIds.push(entry.item.id);
      }
    }
    if (domainItems[domain].length === 0 || unsetIds.length > 0) {
      unknownOrUnset.push({ domain, unset_item_ids: unsetIds });
    }
  }

  const availability = {
    // Talking footage requires real visual camera media. Audio alone never
    // proves a talking head exists; it is reported separately as has_audio.
    has_talking_footage: mediaRecords.some((record) => record.kind === "camera"),
    has_screen_demo: mediaRecords.some((record) => record.kind === "screen"),
    has_screenshot_image:
      mediaRecords.some((record) => record.kind === "image") ||
      assetRecords.some((asset) => asset.type === "image"),
    // Provider-independent: any asset carrying generation metadata is a
    // generated asset, regardless of which provider produced it. New
    // providers need no compiler change as long as they record metadata.
    has_generated_asset: assetRecords.some((asset) => asset.generation !== undefined),
    has_audio:
      mediaRecords.some((record) => record.kind === "audio") ||
      assetRecords.some((asset) => asset.type === "audio"),
  };

  const knownUnknowns: DirectorContext["known_unknowns"] = [];
  if (transcript === undefined) {
    knownUnknowns.push({
      area: "transcript",
      detail: "No transcript is available; timing must come from script anchors only.",
    });
  }
  if (!availability.has_talking_footage) {
    knownUnknowns.push({
      area: "media.talking-footage",
      detail: "No talking-head footage is available.",
    });
  }
  if (!availability.has_screen_demo) {
    knownUnknowns.push({
      area: "media.screen-demo",
      detail: "No real screen/demo recording is available; do not assume one exists.",
    });
  }
  if (!availability.has_screenshot_image) {
    knownUnknowns.push({
      area: "media.screenshot-image",
      detail: "No screenshot or image asset is available.",
    });
  }
  if (!availability.has_generated_asset) {
    knownUnknowns.push({
      area: "media.generated-asset",
      detail: "No generated asset is available.",
    });
  }
  if (!availability.has_audio) {
    knownUnknowns.push({
      area: "media.audio",
      detail: "No audio track is available.",
    });
  }

  return parseDirectorContext({
    version: 1,
    project_slug: project.slug,
    project_id: project.id,
    frozen_script: frozenIdentity,
    style_version: snapshot.style_version,
    script_text: input.frozenScriptText,
    content_summary: {
      script_lines: input.frozenScriptText.split("\n").length,
      script_chars: input.frozenScriptText.length,
      transcript_segments: transcript?.segments.length ?? 0,
      media_records: mediaRecords.length,
      asset_records: assetRecords.length,
    },
    ...(transcript === undefined ? {} : { transcript }),
    media_assets: { records: mediaRecords, assets: assetRecords, availability },
    style_guidance: {
      mandatory_constraints: mandatory,
      approved_advisories: advisories,
      strong_guidance: strong,
      optional_candidates: optional,
      unknown_or_unset: unknownOrUnset,
    },
    references: snapshot.references.items,
    reference_inbox: snapshot.reference_inbox.items,
    hard_constraints: [...DIRECTOR_HARD_CONSTRAINTS],
    known_unknowns: knownUnknowns,
    output_contract: { kind: "director-plan", version: 1 },
    script_visual_risks: [],
  });
}

/**
 * Staleness for compiled contexts. A context is bound to one project, one
 * frozen-script byte identity, and one style version: a change in any of
 * the three — or a context evaluated against a different project —
 * independently retires it. This reuses the P9.1 byte-identity mechanism
 * and never weakens it.
 */
export function isDirectorContextStale(
  contextInput: DirectorContext,
  currentProject: ProjectIdentity,
  currentFrozenSha256: string,
  currentStyleVersion: string,
): boolean {
  const context = directorContextSchema.parse(contextInput);
  const project = projectIdentitySchema.parse(currentProject);
  const currentSha = sha256Schema.parse(currentFrozenSha256);
  const currentStyle = brandVersionSchema.parse(currentStyleVersion);
  return (
    context.project_id !== project.id ||
    context.project_slug !== project.slug ||
    context.frozen_script.sha256 !== currentSha ||
    context.style_version !== currentStyle
  );
}
