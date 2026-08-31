import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { platformIdValues } from "../src/contracts/publish.ts";
import { assertTransition } from "../src/contracts/state.ts";
import { DryRunPublisherAdapter } from "../src/publish/dry-run-adapter.ts";

const temporaryDirectories: string[] = [];
const cliPath = resolve(process.cwd(), "dist", "cli", "creator.js");

afterEach(() => {
  vi.unstubAllGlobals();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("P7 publish contracts and dry-run gate", () => {
  it("has exactly the five supported platform ids and never opens PUBLISHED", () => {
    expect(platformIdValues).toEqual(["douyin", "video_wechat", "xiaohongshu", "bilibili", "youtube"]);
    expect(() => assertTransition("EXPORT_READY", "PUBLISH_READY")).not.toThrow();
    expect(() => assertTransition("PUBLISH_READY", "PUBLISHED")).toThrow(
      "Illegal project state transition",
    );
  });

  it("writes a local accepted result without using fetch when an explicit test fake is enabled", async () => {
    const directory = createTemporaryDirectory();
    const networkAttempt = vi.fn();
    vi.stubGlobal("fetch", networkAttempt);
    const adapter = new DryRunPublisherAdapter("youtube", {
      results_directory: join(directory, "results"),
      enabled: true,
    });

    const result = await adapter.publish(
      {
        project_slug: "demo",
        media_path: "publish/package/master.mp4",
        media_sha256: "a".repeat(64),
        metadata: { title: "", description: "", hashtags: [] },
      },
      {
        platform: "youtube",
        caption: "",
        cover_path: "publish/package/cover.TODO",
        media_path: "publish/package/master.mp4",
        dry_run: true,
      },
    );

    expect(result).toEqual({
      platform: "youtube",
      status: "accepted",
      dry_run: true,
      platform_ids: [],
      error: null,
    });
    expect(networkAttempt).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(join(directory, "results", "youtube.json"), "utf8"))).toEqual(result);
  });

  it("refuses dry-run for an unexported project even when the opt-in flag is present", () => {
    const cwd = createTemporaryDirectory();
    configureWorkspace(cwd);
    expect(runCreator(cwd, ["init", "demo"]).status).toBe(0);

    const dryRun = runCreator(cwd, ["publish", "dry-run", "demo"], { dryRunEnabled: true });
    const projectDirectory = projectPath(cwd, "demo");

    expect(dryRun.status).toBe(1);
    expect(dryRun.stderr).toContain("must be EXPORT_READY before publish dry-run");
    expect(existsSync(join(projectDirectory, "publish", "results"))).toBe(false);
    expect(readState(projectDirectory)).toEqual({ status: "CREATED" });
  });

  it("plans, then performs only an opt-in local dry-run and writes every platform result", () => {
    const cwd = createTemporaryDirectory();
    configureWorkspace(cwd);
    const projectDirectory = createExportReadyProject(cwd, "demo");

    const plan = runCreator(cwd, ["publish", "plan", "demo"]);
    const planPath = join(projectDirectory, "publish", "plan.json");
    expect(plan.status).toBe(0);
    expect(plan.stdout).toBe("PUBLISH_PLAN_READY demo 5\n");
    expect(readState(projectDirectory)).toEqual({ status: "EXPORT_READY" });
    expect(JSON.parse(readFileSync(planPath, "utf8"))).toMatchObject({
      version: 1,
      project_slug: "demo",
      package: {
        media_path: "publish/package/master.mp4",
        metadata: { title: "Fixture title", description: "Fixture description", hashtags: ["fixture"] },
      },
      targets: platformIdValues.map((platform) => ({
        platform,
        dry_run: true,
        media_path: "publish/package/master.mp4",
        cover_path: "publish/package/cover.TODO",
      })),
    });

    const disabledDryRun = runCreator(cwd, ["publish", "dry-run", "demo"]);
    expect(disabledDryRun.status).toBe(1);
    expect(disabledDryRun.stderr).toContain("CREATOR_PUBLISH_DRY_RUN=1");
    expect(existsSync(join(projectDirectory, "publish", "results"))).toBe(false);
    expect(readState(projectDirectory)).toEqual({ status: "EXPORT_READY" });

    const enabledDryRun = runCreator(cwd, ["publish", "dry-run", "demo"], { dryRunEnabled: true });
    expect(enabledDryRun.status).toBe(0);
    expect(enabledDryRun.stdout).toBe("PUBLISH_READY demo 5\n");
    expect(readState(projectDirectory)).toEqual({ status: "PUBLISH_READY" });
    for (const platform of platformIdValues) {
      expect(JSON.parse(readFileSync(join(projectDirectory, "publish", "results", `${platform}.json`), "utf8"))).toEqual({
        platform,
        status: "accepted",
        dry_run: true,
        platform_ids: [],
        error: null,
      });
    }

    const liveAttempt = runCreator(cwd, ["publish", "--live", "demo"], { dryRunEnabled: true });
    expect(liveAttempt.status).toBe(1);
    expect(liveAttempt.stderr).toContain("Usage: creator publish <plan|dry-run> <slug>");
    expect(readState(projectDirectory)).toEqual({ status: "PUBLISH_READY" });
  });

  it("moves to WAITING_USER_ACTION instead of publishing when master.mp4 is missing", () => {
    const cwd = createTemporaryDirectory();
    configureWorkspace(cwd);
    const projectDirectory = createExportReadyProject(cwd, "missing-master", false);

    const plan = runCreator(cwd, ["publish", "plan", "missing-master"]);

    expect(plan.status).toBe(1);
    expect(plan.stderr).toContain("publish/package/master.mp4 is missing");
    expect(readState(projectDirectory)).toEqual({ status: "WAITING_USER_ACTION" });
    expect(existsSync(join(projectDirectory, "publish", "plan.json"))).toBe(false);
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-publish-test-"));
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

function createExportReadyProject(cwd: string, slug: string, includeMaster = true): string {
  expect(runCreator(cwd, ["init", slug]).status).toBe(0);
  const directory = projectPath(cwd, slug);
  writeFileSync(join(directory, "state.json"), '{"status":"EXPORT_READY"}\n', "utf8");
  const packageDirectory = join(directory, "publish", "package");
  mkdirSync(packageDirectory, { recursive: true });
  if (includeMaster) {
    writeFileSync(join(packageDirectory, "master.mp4"), Buffer.from("P7 fixture master"));
  }
  writeFileSync(
    join(packageDirectory, "metadata.json"),
    JSON.stringify({ title: "Fixture title", description: "Fixture description", hashtags: ["fixture"] }),
    "utf8",
  );
  writeFileSync(join(packageDirectory, "cover.TODO"), "fixture cover placeholder\n", "utf8");
  return directory;
}

function projectPath(cwd: string, slug: string): string {
  return join(cwd, "temporary-workspace", "projects", slug);
}

function readState(projectDirectory: string): unknown {
  return JSON.parse(readFileSync(join(projectDirectory, "state.json"), "utf8"));
}

function runCreator(
  cwd: string,
  arguments_: readonly string[],
  options: { dryRunEnabled?: boolean } = {},
) {
  const environment = { ...process.env };
  delete environment.MINIMAX_API_KEY;
  delete environment.CREATOR_PUBLISH_DRY_RUN;
  if (options.dryRunEnabled) {
    environment.CREATOR_PUBLISH_DRY_RUN = "1";
  }

  return spawnSync(process.execPath, [cliPath, ...arguments_], {
    cwd,
    encoding: "utf8",
    env: environment,
  });
}
