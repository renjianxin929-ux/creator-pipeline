import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseEditPlan } from "../src/contracts/index.ts";
import {
  executeFfmpegEditPlan,
  isFfmpegAvailable,
  isFfprobeAvailable,
} from "../src/edit/ffmpeg-executor.ts";
import { ingestMedia } from "../src/ingest/ingest-media.ts";
import { initializeProject, readProjectMediaRecords } from "../src/project/project-store.ts";

const temporaryDirectories: string[] = [];
const mediaToolsAvailable = isFfmpegAvailable() && isFfprobeAvailable();

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("FFmpeg edit-plan executor", () => {
  it("fails before writing an output when FFmpeg is unavailable", () => {
    const cwd = createTemporaryDirectory();
    const project = initializeProject("demo", cwd);
    const outputPath = join(project.directory, "render", "rough-cut.mp4");

    expect(() =>
      executeFfmpegEditPlan(
        {
          project_directory: project.directory,
          plan: parseEditPlan({
            version: 1,
            timeline: [
              {
                id: "clip_001",
                source: "raw/camera/missing.mp4",
                source_start_ms: 0,
                source_end_ms: 500,
                layout: "layout.talking-head",
                caption: true,
              },
            ],
          }),
          media_records: [],
          asset_manifest: { version: 1, assets: [] },
        },
        { ffmpeg_command: "creator-ffmpeg-that-does-not-exist" },
      ),
    ).toThrow("FFmpeg is unavailable");
    expect(existsSync(outputPath)).toBe(false);
  });

  it.runIf(mediaToolsAvailable)("cuts and concats two edit-plan clips into a deterministic rough cut", async () => {
    const cwd = createTemporaryDirectory();
    const project = initializeProject("demo", cwd);
    const fixturePath = createTinyVideoFixture(cwd);
    const ingested = await ingestMedia("demo", [fixturePath], cwd);
    const [media] = ingested.ingested;
    expect(media).toBeDefined();

    const result = executeFfmpegEditPlan(
      {
        project_directory: project.directory,
        plan: parseEditPlan({
          version: 1,
          format: "9:16",
          timeline: [
            {
              id: "clip_001",
              source: media!.path,
              source_start_ms: 0,
              source_end_ms: 500,
              layout: "layout.talking-head",
              caption: true,
            },
            {
              id: "clip_002",
              source: media!.id,
              source_start_ms: 500,
              source_end_ms: 1_000,
              layout: "layout.screen-demo",
              caption: false,
            },
          ],
        }),
        media_records: readProjectMediaRecords("demo", cwd),
        asset_manifest: { version: 1, assets: [] },
      },
      { output_dimensions: { width: 32, height: 56 } },
    );

    expect(result).toMatchObject({
      output_relative_path: "render/rough-cut.mp4",
      clip_count: 2,
      duration_ms: 1_000,
    });
    expect(existsSync(result.output_path)).toBe(true);
    expect(statSync(result.output_path).size).toBeGreaterThan(0);
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-ffmpeg-test-"));
  temporaryDirectories.push(directory);
  writeFileSync(join(directory, "creator.config.json"), JSON.stringify({ workspace: "./workspace" }), "utf8");
  return directory;
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
      "1.2",
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
