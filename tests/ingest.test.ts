import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { mediaIdFromSha256 } from "../src/contracts/media.ts";
import { classifyMedia } from "../src/ingest/classify.ts";
import { ingestMedia } from "../src/ingest/ingest-media.ts";
import { initializeProject, readProjectMediaRecords, readProjectState } from "../src/project/project-store.ts";

const temporaryDirectories: string[] = [];
const mediaToolsAvailable = commandIsAvailable("ffmpeg") && commandIsAvailable("ffprobe");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("P1 media classification", () => {
  it("uses a cheap probe-plus-extension intake guess", () => {
    expect(
      classifyMedia("capture.mp4", {
        width: 1920,
        height: 1080,
        has_audio: true,
        orientation: "landscape",
      }),
    ).toBe("screen");
    expect(
      classifyMedia("camera.mov", {
        width: 1080,
        height: 1920,
        has_audio: true,
        orientation: "portrait",
      }),
    ).toBe("camera");
    expect(classifyMedia("voice.wav", { has_audio: true })).toBe("audio");
    expect(classifyMedia("cover.png", { width: 1080, height: 1080 })).toBe("image");
    expect(classifyMedia("unknown.bin", {})).toBe("misc");
  });
});

describe("P1 ingest", () => {
  it.runIf(mediaToolsAvailable)("copies normalized media once and skips duplicate bytes", async () => {
    const cwd = createTemporaryDirectory();
    configureWorkspace(cwd);
    const project = initializeProject("demo", cwd);
    const fixturePath = createTinyVideoFixture(cwd);

    const first = await ingestMedia("demo", [fixturePath], cwd);

    expect(first.failures).toEqual([]);
    expect(first.duplicate_skipped).toEqual([]);
    expect(first.ingested).toHaveLength(1);

    const [record] = first.ingested;
    expect(record).toMatchObject({
      id: mediaIdFromSha256(record!.sha256),
      path: expect.stringMatching(/^raw\/(camera|screen|audio|image|misc)\/sha256-/),
      has_audio: true,
    });
    expect(record!.duration_ms).toBeGreaterThan(0);
    expect(readProjectState("demo", cwd)).toEqual({ status: "INGESTED" });
    expect(readProjectMediaRecords("demo", cwd)).toEqual([record]);
    expect(readdirSync(join(project.directory, "raw", record!.kind))).toHaveLength(1);

    const duplicate = await ingestMedia("demo", [fixturePath], cwd);
    const events = readFileSync(join(project.directory, "events.ndjson"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { event: string; stage: string });

    expect(duplicate.ingested).toEqual([]);
    expect(duplicate.failures).toEqual([]);
    expect(duplicate.duplicate_skipped).toEqual([record]);
    expect(readProjectMediaRecords("demo", cwd)).toEqual([record]);
    expect(readdirSync(join(project.directory, "raw", record!.kind))).toHaveLength(1);
    expect(readProjectState("demo", cwd)).toEqual({ status: "INGESTED" });
    expect(
      events.some((event) => event.event === "ingest_duplicate_skipped" && event.stage === "ingest"),
    ).toBe(true);
  });

  it.runIf(mediaToolsAvailable)("keeps successful media when another input is unreadable", async () => {
    const cwd = createTemporaryDirectory();
    configureWorkspace(cwd);
    initializeProject("demo", cwd);
    const fixturePath = createTinyVideoFixture(cwd);

    const result = await ingestMedia("demo", [join(cwd, "missing.mp4"), fixturePath], cwd);

    expect(result.ingested).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
    expect(readProjectMediaRecords("demo", cwd)).toHaveLength(1);
    expect(readProjectState("demo", cwd)).toEqual({ status: "INGESTED" });
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-ingest-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function configureWorkspace(cwd: string): void {
  writeFileSync(
    join(cwd, "creator.config.json"),
    JSON.stringify({ workspace: "./temporary-workspace" }),
    "utf8",
  );
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
      "color=c=black:s=16x16:r=10",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=mono",
      "-t",
      "0.2",
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

function commandIsAvailable(command: string): boolean {
  const result = spawnSync(command, ["-version"], { stdio: "ignore", windowsHide: true });
  return result.error === undefined && result.status === 0;
}
