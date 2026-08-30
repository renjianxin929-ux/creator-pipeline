import {
  parseEditPlan,
  type AssetManifestRecord,
  type EditPlan,
  type EditPlanClip,
  type EditPlanLayout,
  type MediaRecord,
  type SilenceInterval,
  type SilenceMap,
  type TranscriptDocument,
  type TranscriptSegment,
} from "../contracts/index.js";
import {
  appendProjectEvent,
  readProjectAssetManifest,
  readProjectMediaRecords,
  readProjectSilenceMap,
  readProjectState,
  readProjectTranscript,
  transitionProjectState,
  writeProjectEditPlan,
} from "../project/project-store.js";
import { resolveProjectBrand } from "../brand/project-brand.js";

export class EditPlanningError extends Error {
  override name = "EditPlanningError";
}

export class EditPlanningWaitingError extends EditPlanningError {
  override name = "EditPlanningWaitingError";
}

export interface CreateRuleBasedEditPlanInput {
  transcript: TranscriptDocument;
  silence_map?: SilenceMap;
  source_media: MediaRecord;
  default_layout: EditPlanLayout;
  assets: readonly AssetManifestRecord[];
}

/**
 * P5's planner writes an editable plan only. It does not invoke an LLM,
 * FFmpeg, a provider, or a renderer.
 */
export function createRuleBasedEditPlan(input: CreateRuleBasedEditPlanInput): EditPlan {
  const longPauses =
    input.silence_map?.source_media_id === input.transcript.source_media_id
      ? input.silence_map.intervals.filter((interval) => interval.reason === "long_pause")
      : [];
  const spokenClips = createSpokenClips(
    input.transcript.segments,
    longPauses,
    input.source_media.path,
    layoutForSourceMedia(input.source_media, input.default_layout),
  );

  if (spokenClips.length === 0) {
    throw new EditPlanningWaitingError(
      "Edit planning is waiting for at least one timed spoken transcript segment.",
    );
  }

  const broll = createOptionalBrollClip(input.assets);
  return parseEditPlan({
    version: 1,
    format: "9:16",
    timeline: broll === undefined ? spokenClips : [...spokenClips, broll],
  });
}

/**
 * Allows an optional final-eligible B-roll asset without making a waiting
 * assisted-provider request a prerequisite for preview. The v0 plan appends
 * it so every spoken clip stays in its original transcript order.
 */
function createOptionalBrollClip(
  assets: readonly AssetManifestRecord[],
): EditPlanClip | undefined {
  const asset = assets.find(
    (candidate) =>
      candidate.type === "video" &&
      candidate.final_eligible &&
      !candidate.has_watermark &&
      candidate.duration_ms !== undefined &&
      candidate.duration_ms > 0,
  );

  if (asset === undefined || asset.duration_ms === undefined) {
    return undefined;
  }

  return {
    id: `broll_${asset.asset_id}`,
    source_asset_id: asset.asset_id,
    source_start_ms: 0,
    source_end_ms: Math.min(asset.duration_ms, 2_000),
    layout: "layout.broll",
    caption: false,
  };
}

function createSpokenClips(
  segments: readonly TranscriptSegment[],
  longPauses: readonly SilenceInterval[],
  sourcePath: string,
  layout: EditPlanLayout,
): EditPlanClip[] {
  const clips: EditPlanClip[] = [];

  for (const segment of segments) {
    const ranges = subtractLongPauses(segment, longPauses);
    const hasMultipleRanges = ranges.length > 1;

    for (const [index, range] of ranges.entries()) {
      clips.push({
        id: hasMultipleRanges ? `${segment.id}_part_${String(index + 1).padStart(2, "0")}` : segment.id,
        source: sourcePath,
        source_start_ms: range.start_ms,
        source_end_ms: range.end_ms,
        layout,
        caption: true,
      });
    }
  }

  return clips;
}

function subtractLongPauses(
  segment: TranscriptSegment,
  longPauses: readonly SilenceInterval[],
): Array<{ start_ms: number; end_ms: number }> {
  const ranges: Array<{ start_ms: number; end_ms: number }> = [];
  let cursor = segment.start_ms;

  for (const pause of longPauses) {
    if (pause.end_ms <= cursor || pause.start_ms >= segment.end_ms) {
      continue;
    }

    const pauseStart = Math.max(cursor, pause.start_ms);
    if (pauseStart > cursor) {
      ranges.push({ start_ms: cursor, end_ms: pauseStart });
    }
    cursor = Math.max(cursor, pause.end_ms);
  }

  if (cursor < segment.end_ms) {
    ranges.push({ start_ms: cursor, end_ms: segment.end_ms });
  }

  return ranges;
}

function layoutForSourceMedia(media: MediaRecord, defaultLayout: EditPlanLayout): EditPlanLayout {
  return media.kind === "screen" ? "layout.screen-demo" : defaultLayout;
}

export function planProjectEdit(slug: string, cwd = process.cwd()): EditPlan {
  const currentState = readProjectState(slug, cwd);
  if (
    currentState.status !== "TRANSCRIBED" &&
    currentState.status !== "ASSETS_READY" &&
    currentState.status !== "WAITING_USER_ACTION" &&
    currentState.status !== "EDIT_PLAN_READY"
  ) {
    throw new EditPlanningError(
      `Project ${slug} must be TRANSCRIBED, ASSETS_READY, or waiting for optional assets before edit planning; current state is ${currentState.status}`,
    );
  }

  const transcript = readProjectTranscript(slug, cwd);
  if (transcript === undefined) {
    return waitForEditPlanning(
      slug,
      currentState.status,
      "Edit planning is waiting for derived/transcript.json. Run creator transcribe, then rerun creator edit plan.",
      cwd,
    );
  }

  const sourceMedia = readProjectMediaRecords(slug, cwd).find(
    (media) => media.id === transcript.source_media_id,
  );
  if (sourceMedia === undefined) {
    return waitForEditPlanning(
      slug,
      currentState.status,
      "Edit planning is waiting for the ingested media referenced by the transcript.",
      cwd,
    );
  }

  try {
    const brand = resolveProjectBrand(slug, cwd).brand;
    const plan = createRuleBasedEditPlan({
      transcript,
      silence_map: readProjectSilenceMap(slug, cwd),
      source_media: sourceMedia,
      default_layout: brand.defaults.templates.layout,
      assets: readProjectAssetManifest(slug, cwd).assets,
    });
    writeProjectEditPlan(slug, plan, cwd);
    if (currentState.status !== "EDIT_PLAN_READY") {
      transitionProjectState(slug, "EDIT_PLAN_READY", cwd);
    }
    appendProjectEvent(
      slug,
      {
        ts: new Date().toISOString(),
        stage: "edit_plan",
        event: "edit_plan_ready",
        project: slug,
      },
      cwd,
    );
    return plan;
  } catch (error) {
    if (error instanceof EditPlanningWaitingError) {
      return waitForEditPlanning(slug, currentState.status, error.message, cwd);
    }

    appendProjectEvent(
      slug,
      {
        ts: new Date().toISOString(),
        stage: "edit_plan",
        event: "edit_plan_failed",
        project: slug,
      },
      cwd,
    );
    transitionProjectState(slug, "FAILED", cwd);
    const message = error instanceof Error ? error.message : "Unable to create an edit plan";
    throw new EditPlanningError(message);
  }
}

function waitForEditPlanning(
  slug: string,
  currentStatus: "TRANSCRIBED" | "ASSETS_READY" | "WAITING_USER_ACTION" | "EDIT_PLAN_READY",
  message: string,
  cwd: string,
): never {
  appendProjectEvent(
    slug,
    {
      ts: new Date().toISOString(),
      stage: "edit_plan",
      event: "waiting_user_action",
      project: slug,
    },
    cwd,
  );
  if (currentStatus !== "WAITING_USER_ACTION") {
    transitionProjectState(slug, "WAITING_USER_ACTION", cwd);
  }
  throw new EditPlanningWaitingError(message);
}
