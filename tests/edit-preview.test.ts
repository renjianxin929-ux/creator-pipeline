import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { assertTransition, mediaIdFromSha256 } from "../src/contracts/index.ts";
import { planProjectEdit } from "../src/edit/edit-planner.ts";
import { ingestMedia } from "../src/ingest/ingest-media.ts";
import {
  initializeProject,
  readProjectMediaRecords,
  readProjectState,
} from "../src/project/project-store.ts";
import {
  isRemotionPreviewAvailable,
  mapTranscriptToPreviewCaptions,
  renderProjectPreview,
} from "../src/render/preview-renderer.ts";

const temporaryDirectories: string[] = [];
const remotionRenderAvailable = isRemotionPreviewAvailable();

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("P5 edit-plan and preview gate", () => {
  it("allows the required edit and preview state transitions", () => {
    expect(() => assertTransition("TRANSCRIBED", "EDIT_PLAN_READY")).not.toThrow();
    expect(() => assertTransition("ASSETS_READY", "EDIT_PLAN_READY")).not.toThrow();
    expect(() => assertTransition("EDIT_PLAN_READY", "PREVIEW_READY")).not.toThrow();
    expect(() => assertTransition("WAITING_USER_ACTION", "EDIT_PLAN_READY")).not.toThrow();
  });

  it("keeps spoken segments, removes embedded long pauses, and admits one reviewed b-roll asset", () => {
    const { cwd, project, sourceMedia } = createTranscribedProject();
    writeFileSync(
      join(project.directory, "assets", "manifest.json"),
      `${JSON.stringify({
        version: 1,
        assets: [
          {
            asset_id: "asset_012",
            type: "video",
            source: "manual",
            role: "concept_broll",
            path: "assets/generated/asset_012.mp4",
            duration_ms: 1_200,
            has_watermark: false,
            final_eligible: true,
          },
        ],
      }, null, 2)}\n`,
      "utf8",
    );

    const plan = planProjectEdit("demo", cwd);

    expect(plan.timeline).toEqual([
      expect.objectContaining({
        id: "seg_001_part_01",
        source: sourceMedia.path,
        source_start_ms: 0,
        source_end_ms: 500,
        caption: true,
      }),
      expect.objectContaining({
        id: "seg_001_part_02",
        source_start_ms: 1_000,
        source_end_ms: 1_500,
        caption: true,
      }),
      expect.objectContaining({
        id: "seg_002",
        source_start_ms: 2_000,
        source_end_ms: 2_500,
        caption: true,
      }),
      expect.objectContaining({
        id: "broll_asset_012",
        source_asset_id: "asset_012",
        source_end_ms: 1_200,
        layout: "layout.broll",
        caption: false,
      }),
    ]);
    expect(readProjectState("demo", cwd)).toEqual({ status: "EDIT_PLAN_READY" });
    expect(existsSync(join(project.directory, "plans", "edit-plan.json"))).toBe(true);
  });

  it("does not block an optional preview on a P4 assisted-provider wait", () => {
    const { cwd, project } = createTranscribedProject({ status: "WAITING_USER_ACTION" });
    writeFileSync(
      join(project.directory, "plans", "asset-plan.json"),
      `${JSON.stringify({
        version: 1,
        project_slug: "demo",
        generated_at: new Date().toISOString(),
        requests: [
          {
            asset_id: "asset_req_001",
            purpose: "concept_broll",
            priority: "medium",
            description: "Optional visual support",
            preferred_source: "generated",
            fallback_source: "brand_motion",
            generation: {
              provider_preference: ["grok_ui"],
              max_attempts: 1,
              cash_budget_cny: 0,
            },
          },
        ],
      }, null, 2)}\n`,
      "utf8",
    );

    const plan = planProjectEdit("demo", cwd);

    expect(plan.timeline).toHaveLength(3);
    expect(plan.timeline.some((clip) => clip.source_asset_id !== undefined)).toBe(false);
    expect(readProjectState("demo", cwd)).toEqual({ status: "EDIT_PLAN_READY" });
  });

  it("rebases caption overlay timings from transcript to the edit-plan rough cut", () => {
    const { cwd } = createTranscribedProject();
    const plan = planProjectEdit("demo", cwd);

    expect(
      mapTranscriptToPreviewCaptions(plan, [
        { id: "seg_001", start_ms: 0, end_ms: 1_500, speaker: "spk_0", text: "第一句" },
        { id: "seg_002", start_ms: 2_000, end_ms: 2_500, speaker: "spk_0", text: "第二句" },
      ]),
    ).toEqual([
      { id: "seg_001_part_01:seg_001", start_ms: 0, end_ms: 500, text: "第一句" },
      { id: "seg_001_part_02:seg_001", start_ms: 500, end_ms: 1_000, text: "第一句" },
      { id: "seg_002:seg_002", start_ms: 1_000, end_ms: 1_500, text: "第二句" },
    ]);
  });

  it.runIf(remotionRenderAvailable)("renders a small fixture preview and reaches PREVIEW_READY without providers", async () => {
    const cwd = createTemporaryDirectory();
    const project = initializeProject("preview", cwd);
    const fixturePath = createTinyVideoFixture(cwd);
    const ingested = await ingestMedia("preview", [fixturePath], cwd);
    const [sourceMedia] = ingested.ingested;
    expect(sourceMedia).toBeDefined();

    writeFileSync(join(project.directory, "state.json"), '{"status":"TRANSCRIBED"}\n', "utf8");
    writeFileSync(
      join(project.directory, "derived", "transcript.json"),
      `${JSON.stringify({
        source_media_id: sourceMedia!.id,
        segments: [
          {
            id: "seg_001",
            start_ms: 0,
            end_ms: 400,
            speaker: "spk_0",
            text: "Preview fixture.",
          },
        ],
      }, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(project.directory, "derived", "silence-map.json"),
      `${JSON.stringify({ source_media_id: sourceMedia!.id, intervals: [] }, null, 2)}\n`,
      "utf8",
    );

    planProjectEdit("preview", cwd);
    const result = await renderProjectPreview("preview", cwd, {
      ffmpeg: { output_dimensions: { width: 32, height: 56 } },
      render_scale: 0.05,
    });

    expect(existsSync(result.preview_path)).toBe(true);
    expect(statSync(result.preview_path).size).toBeGreaterThan(0);
    expect(readProjectState("preview", cwd)).toEqual({ status: "PREVIEW_READY" });
  }, 120_000);
});

function createTranscribedProject(
  options: { status?: "TRANSCRIBED" | "WAITING_USER_ACTION" } = {},
) {
  const cwd = createTemporaryDirectory();
  const project = initializeProject("demo", cwd);
  const sha256 = "a".repeat(64);
  const sourceMedia = {
    id: mediaIdFromSha256(sha256),
    sha256,
    byte_size: 1,
    path: "raw/camera/source.mp4",
    kind: "camera" as const,
    duration_ms: 3_000,
    has_audio: true,
  };

  mkdirSync(join(project.directory, "raw", "camera"), { recursive: true });
  writeFileSync(join(project.directory, "raw", "camera", "source.mp4"), "fixture", "utf8");
  writeFileSync(join(project.directory, "state.json"), `${JSON.stringify({ status: options.status ?? "TRANSCRIBED" })}\n`, "utf8");
  writeFileSync(
    join(project.directory, "derived", "media-probe.json"),
    `${JSON.stringify([sourceMedia], null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(project.directory, "derived", "transcript.json"),
    `${JSON.stringify({
      source_media_id: sourceMedia.id,
      segments: [
        { id: "seg_001", start_ms: 0, end_ms: 1_500, speaker: "spk_0", text: "第一句" },
        { id: "seg_002", start_ms: 2_000, end_ms: 2_500, speaker: "spk_0", text: "第二句" },
      ],
    }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(project.directory, "derived", "silence-map.json"),
    `${JSON.stringify({
      source_media_id: sourceMedia.id,
      intervals: [{ start_ms: 500, end_ms: 1_000, reason: "long_pause" }],
    }, null, 2)}\n`,
    "utf8",
  );

  return { cwd, project, sourceMedia };
}

function createTemporaryDirectory(): string {
  const cwd = mkdtempSync(join(tmpdir(), "creator-pipeline-edit-preview-test-"));
  temporaryDirectories.push(cwd);
  writeFileSync(join(cwd, "creator.config.json"), JSON.stringify({ workspace: "./workspace" }), "utf8");
  return cwd;
}

function createTinyVideoFixture(directory: string): string {
  const fixturePath = join(directory, "fixture.mp4");
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=32x32:r=10",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-t",
      "0.6",
      "-c:v",
      "mpeg4",
      "-c:a",
      "aac",
      "-shortest",
      fixturePath,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  if (result.error !== undefined || result.status !== 0 || !existsSync(fixturePath)) {
    throw new Error(`Unable to generate media fixture: ${result.stderr}`);
  }

  return fixturePath;
}
