import {
  parseDirectorContext,
  parseDirectorPlan,
  parseEditPlan,
  type DirectorContext,
  type DirectorPlan,
  type EditPlan,
} from "../contracts/index.js";
import { assertDirectorPlanBinding } from "./validate-plan.js";

/**
 * P9.3B Director → Edit augmentation.
 *
 * The existing EditPlan remains the single executable timeline: this step
 * returns exactly one EditPlan with the same version and format, the same
 * clips in the same order (minus an optional policy-removed B-roll tail),
 * and only deterministic field updates. No second timeline is created.
 *
 * v1 applies two influences, both derived without invention:
 * - caption policy: an overlapping Director segment sets the clip caption
 *   flag from its caption_mode (none → false, otherwise true);
 * - evidence B-roll policy: when a FROZEN mandatory editing rule forbids
 *   decorative B-roll for a role the plan actually directs, appended
 *   asset B-roll clips are dropped.
 * Layout intent, emphasis text, and motion slots have no fields on the
 * current EditPlan contract and are therefore left untouched.
 */

export interface DirectorEditAugmentation {
  plan: EditPlan;
  caption_updates: number;
  removed_broll_clip_ids: string[];
}

export function augmentEditPlanWithDirection(
  baseInput: EditPlan,
  planInput: DirectorPlan,
  contextInput: DirectorContext,
): DirectorEditAugmentation {
  const base = parseEditPlan(baseInput);
  const plan = parseDirectorPlan(planInput);
  const context = parseDirectorContext(contextInput);
  assertDirectorPlanBinding(plan, context);

  let captionUpdates = 0;
  const timeline = base.timeline.map((clip) => {
    const directing = plan.segments.find((segment) => overlapsClip(segment, clip));
    if (directing === undefined) {
      return clip;
    }
    const caption = directing.caption_mode !== "none";
    if (caption !== clip.caption) {
      captionUpdates += 1;
    }
    return { ...clip, caption };
  });

  const removedBrollClipIds: string[] = [];
  const filtered = enforceEvidenceBrollPolicy(timeline, plan, context, removedBrollClipIds);

  return {
    plan: parseEditPlan({ version: base.version, format: base.format, timeline: filtered }),
    caption_updates: captionUpdates,
    removed_broll_clip_ids: removedBrollClipIds,
  };
}

interface TimedClip {
  source_start_ms: number;
  source_end_ms: number;
}

function overlapsClip(
  segment: { source_range_ms?: { start_ms: number; end_ms: number } },
  clip: TimedClip,
): boolean {
  const range = segment.source_range_ms;
  if (range === undefined) {
    return false;
  }
  return range.start_ms < clip.source_end_ms && clip.source_start_ms < range.end_ms;
}

function enforceEvidenceBrollPolicy(
  timeline: EditPlan["timeline"],
  plan: DirectorPlan,
  context: DirectorContext,
  removedBrollClipIds: string[],
): EditPlan["timeline"] {
  const directedRoles = new Set(plan.segments.map((segment) => segment.semantic_role));
  const blocksDecorative = context.style_guidance.mandatory_constraints.some(
    (entry) =>
      entry.domain === "editing-grammar" &&
      entry.item.applies_to.some((role) => directedRoles.has(role)) &&
      entry.item.forbidden_visuals.some((visual) => visual.split(".").at(-1) === "decorative-broll"),
  );

  if (!blocksDecorative) {
    return timeline;
  }

  return timeline.filter((clip) => {
    const isAppendedBroll = clip.source_asset_id !== undefined && clip.layout === "layout.broll";
    if (isAppendedBroll) {
      removedBrollClipIds.push(clip.id);
      return false;
    }
    return true;
  });
}
