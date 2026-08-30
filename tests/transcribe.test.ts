import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { renderSrt, transcriptDocumentSchema } from "../src/contracts/transcript.ts";
import { FakeTranscribeAdapter } from "../src/transcribe/fake-adapter.ts";
import { FunClipTranscribeAdapter, mapFunClipOutput } from "../src/transcribe/funclip-adapter.ts";

const temporaryDirectories: string[] = [];
const cliPath = resolve(process.cwd(), "dist", "cli", "creator.js");
const mediaToolsAvailable = commandIsAvailable("ffmpeg") && commandIsAvailable("ffprobe");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("P2 transcribe adapters", () => {
  it("uses the deterministic fake adapter without Python or a media fixture", async () => {
    const adapter = new FakeTranscribeAdapter();
    const transcript = await adapter.transcribe({
      source_media_id: "sha256:fake",
      media_path: "/not-read-by-fake.mp4",
    });

    expect(adapter.available()).toBe(true);
    expect(transcriptDocumentSchema.parse(transcript)).toEqual(transcript);
    expect(transcript.segments.map((segment) => segment.id)).toEqual(["seg_001", "seg_002", "seg_003"]);
  });

  it("maps a FunASR-shaped result to our contract and fail-softs when its local model is absent", () => {
    const transcript = mapFunClipOutput(
      [
        {
          sentence_info: [
            { text: "第一句。", start: 0, end: 500, speaker: "spk_1", confidence: 0.91 },
            { text: "第二句。", start: 700, end: 1_200, speaker: "spk_1", confidence: 0.9 },
          ],
        },
      ],
      { source_media_id: "sha256:funasr", media_path: "/local/input.mp4", language: "zh" },
    );
    const unavailable = new FunClipTranscribeAdapter({
      python_command: "creator-python-that-does-not-exist",
      model_path: join(tmpdir(), "creator-missing-funasr-model"),
    });

    expect(transcript).toEqual({
      source_media_id: "sha256:funasr",
      language: "zh",
      segments: [
        {
          id: "seg_001",
          start_ms: 0,
          end_ms: 500,
          speaker: "spk_1",
          text: "第一句。",
          confidence: 0.91,
        },
        {
          id: "seg_002",
          start_ms: 700,
          end_ms: 1_200,
          speaker: "spk_1",
          text: "第二句。",
          confidence: 0.9,
        },
      ],
    });
    expect(() => unavailable.available()).not.toThrow();
    expect(unavailable.available()).toBe(false);
  });
});

describe("creator transcribe", () => {
  it.runIf(mediaToolsAvailable)("writes normalized artifacts with the fake adapter and remains rerunnable", () => {
    const cwd = createTemporaryDirectory();
    configureWorkspace(cwd);
    const fixturePath = createTinyVideoFixture(cwd);

    expect(runCreator(cwd, ["init", "demo"]).status).toBe(0);
    expect(runCreator(cwd, ["ingest", "demo", fixturePath]).status).toBe(0);
    expect(runCreator(cwd, ["status", "demo"]).stdout).toBe("demo: INGESTED\n");

    const transcribed = runCreator(cwd, ["transcribe", "demo"], {
      CREATOR_TRANSCRIBE_ADAPTER: "fake",
      CREATOR_FUNCLIP_MODEL: undefined,
      CREATOR_FUNCLIP_PYTHON: undefined,
    });
    const projectDirectory = join(cwd, "temporary-workspace", "projects", "demo");
    const transcriptPath = join(projectDirectory, "derived", "transcript.json");
    const srtPath = join(projectDirectory, "derived", "transcript.srt");
    const silenceMapPath = join(projectDirectory, "derived", "silence-map.json");
    const media = JSON.parse(readFileSync(join(projectDirectory, "derived", "media-probe.json"), "utf8")) as [
      { id: string },
    ];
    const transcript = transcriptDocumentSchema.parse(JSON.parse(readFileSync(transcriptPath, "utf8")));
    const silenceMap = JSON.parse(readFileSync(silenceMapPath, "utf8"));

    expect(transcribed.status).toBe(0);
    expect(transcribed.stdout).toContain("TRANSCRIBED demo");
    expect(runCreator(cwd, ["status", "demo"]).stdout).toBe("demo: TRANSCRIBED\n");
    expect(transcript.source_media_id).toBe(media[0]!.id);
    expect(readFileSync(srtPath, "utf8")).toBe(renderSrt(transcript.segments));
    expect(readFileSync(srtPath, "utf8")).toMatch(/^1\n00:00:00,000 --> 00:00:00,800\n/);
    expect(silenceMap.intervals).toEqual([
      { start_ms: 800, end_ms: 1_200, reason: "silence" },
      { start_ms: 1_850, end_ms: 4_000, reason: "long_pause" },
    ]);
    expect(existsSync(transcriptPath)).toBe(true);
    expect(existsSync(srtPath)).toBe(true);
    expect(existsSync(silenceMapPath)).toBe(true);
    expect(
      runCreator(cwd, ["transcribe", "demo"], {
        CREATOR_TRANSCRIBE_ADAPTER: "fake",
        CREATOR_FUNCLIP_MODEL: undefined,
        CREATOR_FUNCLIP_PYTHON: undefined,
      }).status,
    ).toBe(0);
    expect(runCreator(cwd, ["status", "demo"]).stdout).toBe("demo: TRANSCRIBED\n");
  });

  it.runIf(mediaToolsAvailable)("keeps INGESTED intact when no local FunClip/FunASR setup is available", () => {
    const cwd = createTemporaryDirectory();
    configureWorkspace(cwd);
    const fixturePath = createTinyVideoFixture(cwd);

    expect(runCreator(cwd, ["init", "waiting"]).status).toBe(0);
    expect(runCreator(cwd, ["ingest", "waiting", fixturePath]).status).toBe(0);

    const transcribed = runCreator(cwd, ["transcribe", "waiting"], {
      CREATOR_TRANSCRIBE_ADAPTER: undefined,
      CREATOR_FUNCLIP_MODEL: join(cwd, "missing-local-funasr-model"),
      CREATOR_FUNCLIP_PYTHON: "creator-python-that-does-not-exist",
    });
    const projectDirectory = join(cwd, "temporary-workspace", "projects", "waiting");
    const events = readFileSync(join(projectDirectory, "events.ndjson"), "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const event = JSON.parse(line) as { stage: string; event: string };
        return { stage: event.stage, event: event.event };
      });

    expect(transcribed.status).toBe(1);
    expect(transcribed.stderr).toContain("Transcription is waiting for local FunClip/FunASR");
    expect(transcribed.stderr).toContain("CREATOR_FUNCLIP_MODEL");
    expect(runCreator(cwd, ["status", "waiting"]).stdout).toBe("waiting: INGESTED\n");
    expect(existsSync(join(projectDirectory, "derived", "transcript.json"))).toBe(false);
    expect(events).toContainEqual({ stage: "transcribe", event: "waiting_user_action" });
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-transcribe-test-"));
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
      "5",
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

function runCreator(
  cwd: string,
  arguments_: readonly string[],
  overrides: Record<string, string | undefined> = {},
) {
  const environment = { ...process.env };
  delete environment.MINIMAX_API_KEY;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete environment[key];
    } else {
      environment[key] = value;
    }
  }

  return spawnSync(process.execPath, [cliPath, ...arguments_], {
    cwd,
    encoding: "utf8",
    env: environment,
  });
}
