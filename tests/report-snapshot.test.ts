import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { publishObservationSchema, retryPolicySchema } from "../src/contracts/index.ts";
import { assertTransition } from "../src/contracts/state.ts";

const temporaryDirectories: string[] = [];
const cliPath = resolve(process.cwd(), "dist", "cli", "creator.js");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("P8 observation and retry contracts", () => {
  it("keeps observation analytics as null local placeholders and retry timing as data", () => {
    expect(
      publishObservationSchema.parse({
        platform: "youtube",
        dry_run: true,
        status: "accepted",
        recorded_at: "2026-08-31T00:00:00.000Z",
      }),
    ).toEqual({
      platform: "youtube",
      dry_run: true,
      status: "accepted",
      recorded_at: "2026-08-31T00:00:00.000Z",
      view_count: null,
      comment_count: null,
    });
    expect(() =>
      publishObservationSchema.parse({
        platform: "youtube",
        dry_run: true,
        status: "accepted",
        recorded_at: "2026-08-31T00:00:00.000Z",
        view_count: 1,
      }),
    ).toThrow();

    expect(
      retryPolicySchema.parse({
        max_attempts: 3,
        backoff: { delays_ms: [1_000, 5_000] },
      }),
    ).toEqual({
      max_attempts: 3,
      backoff: { delays_ms: [1_000, 5_000] },
    });
    expect(() =>
      retryPolicySchema.parse({ max_attempts: 2, backoff: { delays_ms: [1_000, 5_000] } }),
    ).toThrow("backoff delays cannot exceed the available retry attempts");
  });
});

describe("P8 reuse snapshots", () => {
  it("writes only reusable choices, never raw media paths or bytes", () => {
    const cwd = createTemporaryDirectory();
    configureWorkspace(cwd);
    expect(runCreator(cwd, ["init", "reuse-source"]).status).toBe(0);

    const directory = projectPath(cwd, "reuse-source");
    const rawMediaPath = join(directory, "raw", "camera", "private-source.mp4");
    mkdirSync(join(directory, "raw", "camera"), { recursive: true });
    writeFileSync(rawMediaPath, "P8 forbidden raw media bytes", "utf8");
    writeFileSync(join(directory, "state.json"), '{"status":"PUBLISH_READY"}\n', "utf8");
    writeFileSync(
      join(directory, "plans", "edit-plan.json"),
      JSON.stringify({
        version: 1,
        format: "16:9",
        timeline: [
          {
            id: "clip_001",
            source: "raw/camera/private-source.mp4",
            source_start_ms: 0,
            source_end_ms: 1_000,
            layout: "layout.talking-head",
            caption: true,
          },
        ],
      }),
      "utf8",
    );
    writeFileSync(
      join(directory, "publish", "plan.json"),
      JSON.stringify({
        version: 1,
        project_slug: "reuse-source",
        package: {
          project_slug: "reuse-source",
          media_path: "publish/package/master.mp4",
          media_sha256: "a".repeat(64),
          metadata: { title: "", description: "", hashtags: [] },
        },
        targets: [
          {
            platform: "youtube",
            caption: "",
            cover_path: "publish/package/cover.TODO",
            media_path: "publish/package/master.mp4",
            dry_run: true,
          },
        ],
      }),
      "utf8",
    );

    const snapshot = runCreator(cwd, ["snapshot", "reuse-source"]);
    const snapshotPath = join(directory, "publish", "reuse-snapshot.json");
    const snapshotText = readFileSync(snapshotPath, "utf8");

    expect(snapshot.status).toBe(0);
    expect(snapshot.stdout).toBe("REUSE_SNAPSHOT_READY reuse-source\n");
    expect(JSON.parse(snapshotText)).toMatchObject({
      version: 1,
      project_slug: "reuse-source",
      brand_version: "1.0",
      template_defaults: {
        layout: "layout.talking-head",
      },
      edit_plan_format: "16:9",
      publish_plan_platforms: ["youtube"],
    });
    expect(snapshotText).not.toContain("raw/");
    expect(snapshotText).not.toContain("private-source.mp4");
    expect(snapshotText).not.toContain("P8 forbidden raw media bytes");
    expect(snapshotText).not.toContain("media_path");
    expect(existsSync(rawMediaPath)).toBe(true);
  });
});

describe("P8 local project report", () => {
  it("writes the same JSON payload for every primary state from CREATED through PUBLISH_READY", () => {
    const cwd = createTemporaryDirectory();
    configureWorkspace(cwd);
    const states = [
      "CREATED",
      "INGESTED",
      "TRANSCRIBED",
      "ASSET_PLAN_READY",
      "ASSETS_READY",
      "EDIT_PLAN_READY",
      "PREVIEW_READY",
      "HUMAN_APPROVED",
      "EXPORT_READY",
      "PUBLISH_READY",
    ] as const;

    for (const status of states) {
      const slug = `report-${status.toLowerCase().replaceAll("_", "-")}`;
      expect(runCreator(cwd, ["init", slug]).status).toBe(0);
      const directory = projectPath(cwd, slug);
      writeFileSync(join(directory, "state.json"), `${JSON.stringify({ status })}\n`, "utf8");

      const result = runCreator(cwd, ["report", slug]);
      const stdoutPayload = JSON.parse(result.stdout);
      const persistedPayload = JSON.parse(readFileSync(join(directory, "review", "report.json"), "utf8"));

      expect(result.status).toBe(0);
      expect(stdoutPayload).toEqual(persistedPayload);
      expect(stdoutPayload).toMatchObject({
        version: 1,
        project_slug: slug,
        state: status,
        media_count: 0,
        transcript_adapter: "absent",
        preview_hash: "absent",
        export_master_hash: "absent",
        dry_run_results: "absent",
      });
    }
  });

  it("reports available structured evidence without a publisher or network call", () => {
    const cwd = createTemporaryDirectory();
    configureWorkspace(cwd);
    expect(runCreator(cwd, ["init", "evidence"]).status).toBe(0);

    const directory = projectPath(cwd, "evidence");
    const masterBytes = Buffer.from("P8 local master bytes");
    const masterHash = createHash("sha256").update(masterBytes).digest("hex");
    writeFileSync(join(directory, "state.json"), '{"status":"PUBLISH_READY"}\n', "utf8");
    writeFileSync(
      join(directory, "derived", "media-probe.json"),
      JSON.stringify([
        {
          id: `sha256:${"b".repeat(64)}`,
          sha256: "b".repeat(64),
          byte_size: 12,
          path: "raw/camera/evidence.mp4",
          kind: "camera",
        },
      ]),
      "utf8",
    );
    writeFileSync(
      join(directory, "events.ndjson"),
      `${JSON.stringify({
        ts: "2026-08-31T00:00:00.000Z",
        stage: "transcribe",
        event: "transcribe_succeeded",
        project: "evidence",
        provider: "fake_transcriber",
      })}\n`,
      "utf8",
    );
    writeFileSync(
      join(directory, "review", "approval.json"),
      JSON.stringify({
        preview_path: "render/preview.mp4",
        preview_sha256: "c".repeat(64),
        approved_at: "2026-08-31T00:00:00.000Z",
        approved_by: "founder",
      }),
      "utf8",
    );
    mkdirSync(join(directory, "publish", "package"), { recursive: true });
    writeFileSync(join(directory, "publish", "package", "master.mp4"), masterBytes);
    mkdirSync(join(directory, "publish", "results"), { recursive: true });
    writeFileSync(
      join(directory, "publish", "results", "youtube.json"),
      JSON.stringify({
        platform: "youtube",
        status: "accepted",
        dry_run: true,
        platform_ids: [],
        error: null,
      }),
      "utf8",
    );

    const result = runCreator(cwd, ["report", "evidence"]);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report).toMatchObject({
      state: "PUBLISH_READY",
      media_count: 1,
      transcript_adapter: "fake_transcriber",
      preview_hash: "c".repeat(64),
      export_master_hash: masterHash,
      dry_run_results: [
        {
          platform: "youtube",
          status: "accepted",
          dry_run: true,
          platform_ids: [],
          error: null,
        },
      ],
    });
    expect(() => assertTransition("PUBLISH_READY", "PUBLISHED")).toThrow(
      "Illegal project state transition",
    );
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-p8-test-"));
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

function projectPath(cwd: string, slug: string): string {
  return join(cwd, "temporary-workspace", "projects", slug);
}

function runCreator(cwd: string, arguments_: readonly string[]) {
  const environment = { ...process.env };
  delete environment.MINIMAX_API_KEY;
  delete environment.CREATOR_PUBLISH_DRY_RUN;

  return spawnSync(process.execPath, [cliPath, ...arguments_], {
    cwd,
    encoding: "utf8",
    env: environment,
  });
}
