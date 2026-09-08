import {
  directorContextSchema,
  parseDirectorPlan,
  type DirectorContext,
  type DirectorPlan,
  type DirectorSegment,
  type SemanticRole,
} from "../contracts/index.js";
import type { DirectorAdapter } from "./adapter.js";

/**
 * P9.3B deterministic scaffold Director.
 *
 * This is explicitly NOT a real director: it performs no semantic
 * understanding and no model call. Its fixed positional rule (first unit is
 * the HOOK, last unit is the CTA, everything between is a CLAIM) exists
 * only to prove the architecture loop — Context → Plan → validation →
 * EditPlan integration — with byte-deterministic output.
 *
 * Units are transcript segments when timed speech exists, otherwise
 * non-empty script lines. Visual choices honor FROZEN mandatory editing
 * rules for the assigned role when one applies; otherwise a stable
 * role-derived fallback visual is used. Nothing here is presented as
 * product directing capability.
 */
export class FakeDirectorAdapter implements DirectorAdapter {
  readonly id = "fake";

  async direct(contextInput: DirectorContext): Promise<DirectorPlan> {
    const context = directorContextSchema.parse(contextInput);
    const segments = buildScaffoldSegments(context);

    return parseDirectorPlan({
      version: 1,
      project_slug: context.project_slug,
      project_id: context.project_id,
      frozen_script: { ...context.frozen_script },
      style_reference: { style_version: context.style_version },
      segments,
      script_visual_risks: [],
    });
  }
}

interface ScaffoldUnit {
  segment_id: string;
  start_line: number;
  end_line: number;
  start_ms?: number;
  end_ms?: number;
}

function buildScaffoldSegments(context: DirectorContext): DirectorSegment[] {
  const lines = context.script_text
    .split("\n")
    .map((text, index) => ({ text, line: index + 1 }))
    .filter((line) => line.text.trim().length > 0);

  const timed = context.transcript?.segments ?? [];
  const units: ScaffoldUnit[] =
    timed.length > 0
      ? timed.map((segment, index) => ({
          segment_id: `seg_${String(index + 1).padStart(2, "0")}`,
          start_line: 1,
          end_line: lines.length,
          start_ms: segment.start_ms,
          end_ms: segment.end_ms,
        }))
      : lines.map((line, index) => ({
          segment_id: `seg_${String(index + 1).padStart(2, "0")}`,
          start_line: line.line,
          end_line: line.line,
        }));

  return units.map((unit, index) =>
    parseScaffoldSegment(unit, roleForPosition(index, units.length), context),
  );
}

/** Positional scaffold only: first unit hooks, last unit closes, rest claims. */
function roleForPosition(index: number, total: number): SemanticRole {
  if (index === 0) {
    return "HOOK";
  }
  if (index === total - 1 && total > 1) {
    return "CTA";
  }
  return "CLAIM";
}

function parseScaffoldSegment(
  unit: ScaffoldUnit,
  role: SemanticRole,
  context: DirectorContext,
): DirectorSegment {
  const mandatoryRule = context.style_guidance.mandatory_constraints.find(
    (entry) =>
      entry.domain === "editing-grammar" && entry.item.applies_to.includes(role),
  );

  const fallbackVisual = `visual.${role.toLowerCase().replace(/_/g, "-")}.talking-head`;
  const primaryVisual =
    mandatoryRule?.domain === "editing-grammar" && mandatoryRule.item.allowed_visuals.length > 0
      ? mandatoryRule.item.allowed_visuals[0]!
      : fallbackVisual;
  const forbiddenVisuals =
    mandatoryRule?.domain === "editing-grammar" ? [...mandatoryRule.item.forbidden_visuals] : [];
  const motionId =
    mandatoryRule?.domain === "editing-grammar" && mandatoryRule.item.allowed_motion_ids.length > 0
      ? mandatoryRule.item.allowed_motion_ids[0]
      : undefined;

  return {
    segment_id: unit.segment_id,
    script_anchor: { start_line: unit.start_line, end_line: unit.end_line },
    ...(unit.start_ms !== undefined && unit.end_ms !== undefined
      ? { source_range_ms: { start_ms: unit.start_ms, end_ms: unit.end_ms } }
      : {}),
    semantic_role: role,
    primary_visual: primaryVisual,
    allowed_visuals: [primaryVisual],
    forbidden_visuals: forbiddenVisuals,
    caption_mode: "default",
    ...(motionId === undefined ? {} : { motion_id: motionId }),
    reason: "FakeDirector positional scaffold; not a semantic judgment.",
    confidence: 0.5,
  };
}
