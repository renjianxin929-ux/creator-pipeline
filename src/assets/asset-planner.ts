import type { AssetPlan, AssetRequest, TranscriptDocument, TranscriptSegment } from "../contracts/index.js";
import {
  appendProjectEvent,
  readProjectState,
  readProjectTranscript,
  transitionProjectState,
  writeProjectAssetPlan,
} from "../project/project-store.js";

/** The P4 default stays on the Grok UI subscription path, never grok_api. */
export const defaultAssetProviderPreference = [
  "grok_ui",
  "minimax_api",
  "omni_ui",
  "manual",
] as const;

export class AssetPlanningError extends Error {
  override name = "AssetPlanningError";
}

export class AssetPlanningWaitingError extends AssetPlanningError {
  override name = "AssetPlanningWaitingError";
}

export interface PlanProjectAssetsOptions {
  now?: Date;
}

/**
 * Writes planner intent only. It never invokes a provider or creates pixels.
 * P4 v0 uses transcript duration to keep generated insert requests bounded to
 * zero, one, or two slots.
 */
export function planProjectAssets(
  slug: string,
  cwd = process.cwd(),
  options: PlanProjectAssetsOptions = {},
): AssetPlan {
  const currentState = readProjectState(slug, cwd);
  if (
    currentState.status !== "TRANSCRIBED" &&
    currentState.status !== "ASSET_PLAN_READY" &&
    currentState.status !== "WAITING_USER_ACTION"
  ) {
    throw new AssetPlanningError(
      `Project ${slug} must be TRANSCRIBED or ASSET_PLAN_READY before asset planning; current state is ${currentState.status}`,
    );
  }

  const transcript = readProjectTranscript(slug, cwd);
  if (transcript === undefined) {
    return waitForTranscript(slug, currentState.status, cwd);
  }

  try {
    const plan = createRuleBasedAssetPlan(slug, transcript, options.now ?? new Date());
    writeProjectAssetPlan(slug, plan, cwd);
    transitionProjectState(slug, "ASSET_PLAN_READY", cwd);
    appendProjectEvent(slug, {
      ts: new Date().toISOString(),
      stage: "asset_plan",
      event: "asset_plan_ready",
      project: slug,
    }, cwd);
    return plan;
  } catch (error) {
    appendProjectEvent(slug, {
      ts: new Date().toISOString(),
      stage: "asset_plan",
      event: "asset_plan_failed",
      project: slug,
    }, cwd);
    transitionProjectState(slug, "FAILED", cwd);
    const message = error instanceof Error ? error.message : "Unable to create asset plan";
    throw new AssetPlanningError(message);
  }
}

export function createRuleBasedAssetPlan(
  slug: string,
  transcript: TranscriptDocument,
  generatedAt: Date,
): AssetPlan {
  const requests = createRuleBasedAssetRequests(transcript);

  return {
    version: 1,
    project_slug: slug,
    generated_at: generatedAt.toISOString(),
    requests,
  };
}

export function createRuleBasedAssetRequests(transcript: TranscriptDocument): AssetRequest[] {
  if (transcript.segments.length === 0) {
    return [];
  }

  const durationMs = transcript.segments.at(-1)!.end_ms;
  const requestedSlotCount = durationMs >= 60_000 ? 2 : 1;

  return Array.from({ length: requestedSlotCount }, (_value, index) => {
    const segment = chooseSegmentForSlot(transcript.segments, index, requestedSlotCount);
    const timelineHint = createTimelineHint(segment, durationMs);

    return {
      asset_id: `asset_req_${String(index + 1).padStart(3, "0")}`,
      timeline_hint: timelineHint,
      purpose: "concept_broll",
      priority: "medium",
      description: `Visual support for: ${segment.text.slice(0, 240)}`,
      preferred_source: "generated",
      fallback_source: "brand_motion",
      generation: {
        provider_preference: [...defaultAssetProviderPreference],
        max_attempts: 2,
        cash_budget_cny: 4,
      },
    };
  });
}

function waitForTranscript(
  slug: string,
  currentStatus: "TRANSCRIBED" | "ASSET_PLAN_READY" | "WAITING_USER_ACTION",
  cwd: string,
): never {
  appendProjectEvent(slug, {
    ts: new Date().toISOString(),
    stage: "asset_plan",
    event: "waiting_user_action",
    project: slug,
  }, cwd);
  if (currentStatus !== "WAITING_USER_ACTION") {
    transitionProjectState(slug, "WAITING_USER_ACTION", cwd);
  }
  throw new AssetPlanningWaitingError(
    "Asset planning is waiting for the normalized transcript. Run creator transcribe, then rerun creator assets plan.",
  );
}

function chooseSegmentForSlot(
  segments: readonly TranscriptSegment[],
  index: number,
  slotCount: number,
): TranscriptSegment {
  const selectedIndex = Math.min(
    segments.length - 1,
    Math.floor(((index + 1) * segments.length) / (slotCount + 1)),
  );
  return segments[selectedIndex]!;
}

function createTimelineHint(segment: TranscriptSegment, transcriptDurationMs: number) {
  const startMs = segment.start_ms;
  const endMs = Math.min(transcriptDurationMs, Math.max(segment.end_ms, startMs + 3_000));

  return { start_ms: startMs, end_ms: Math.max(endMs, startMs + 1) };
}
