import {
  parseDirectorContext,
  parseDirectorPlan,
  parseEditPlan,
  type DirectorContext,
  type DirectorPlan,
  type EditPlan,
} from "../contracts/index.js";
import { assertDirectorPlanBinding, assertDirectorPlanCompliant } from "./validate-plan.js";

/**
 * P9.3B Director → Edit augmentation.
 *
 * The existing EditPlan remains the single executable timeline: this step
 * returns exactly one EditPlan with the same version and format, the same
 * clips in the same order (minus policy-removed B-roll), and only
 * deterministic field updates. No second timeline is created.
 *
 * Every plan passes binding AND compliance before it may touch the
 * timeline: a non-compliant plan is rejected here even if the caller never
 * ran the manual import gate.
 *
 * v1 applies two influences, both derived without invention:
 * - caption policy: an overlapping Director segment sets the clip caption
 *   flag from its caption_mode (none → false, otherwise true);
 * - evidence B-roll policy: an asset B-roll clip is dropped only when a
 *   timed Director segment protected by a FROZEN anti-decorative editing
 *   rule overlaps that exact clip range. Untimed segments never trigger
 *   removal — without a mappable range, nothing is deleted.
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
  assertDirectorPlanCompliant(plan, context);

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
  // Segment/time scoped: a B-roll clip is removed only when a timed
  // Director segment that is itself protected by a FROZEN anti-decorative
  // rule overlaps that clip's exact range. Clips under other roles, other
  // ranges, or untimed segments are always kept.
  const protectedRanges = plan.segments.flatMap((segment) => {
    const range = segment.source_range_ms;
    if (range === undefined) {
      return [];
    }
    const guarded = context.style_guidance.mandatory_constraints.some(
      (entry) =>
        entry.domain === "editing-grammar" &&
        (entry.item.applies_to as readonly string[]).includes(segment.semantic_role) &&
        entry.item.forbidden_visuals.some((visual) => visual.split(".").at(-1) === "decorative-broll"),
    );
    return guarded ? [{ start_ms: range.start_ms, end_ms: range.end_ms }] : [];
  });

  if (protectedRanges.length === 0) {
    return timeline;
  }

  return timeline.filter((clip) => {
    const isAppendedBroll = clip.source_asset_id !== undefined && clip.layout === "layout.broll";
    const overlapsGuarded = protectedRanges.some(
      (range) => range.start_ms < clip.source_end_ms && clip.source_start_ms < range.end_ms,
    );
    if (isAppendedBroll && overlapsGuarded) {
      removedBrollClipIds.push(clip.id);
      return false;
    }
    return true;
  });
}
