import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initializeProject } from "../src/project/project-store.ts";
import {
  isProjectDirectorPlanStale,
  readProjectDirectorPlan,
  writeProjectDirectorPlan,
  writeProjectFrozenScript,
} from "../src/project/director-store.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("P9.1 Director project persistence", () => {
  it("persists a Director Plan only against the current frozen script", () => {
    const cwd = createTemporaryDirectory();
    initializeProject("demo", cwd);
    const frozenScript = writeProjectFrozenScript("demo", "# Frozen\n\n真实脚本。\n", cwd);

    const plan = createPlan(frozenScript.sha256);
    writeProjectDirectorPlan("demo", plan, cwd);

    expect(readProjectDirectorPlan("demo", cwd)).toEqual(plan);
    expect(isProjectDirectorPlanStale("demo", cwd)).toBe(false);
  });

  it("deterministically invalidates the plan when frozen script bytes change", () => {
    const cwd = createTemporaryDirectory();
    initializeProject("demo", cwd);
    const frozenScript = writeProjectFrozenScript("demo", "version one", cwd);
    writeProjectDirectorPlan("demo", createPlan(frozenScript.sha256), cwd);

    writeProjectFrozenScript("demo", "version two", cwd);

    expect(isProjectDirectorPlanStale("demo", cwd)).toBe(true);
    expect(() => readProjectDirectorPlan("demo", cwd)).toThrow(
      "Director Plan is stale for current frozen script: demo",
    );
  });

  it("refuses to write a plan carrying a stale source-script hash", () => {
    const cwd = createTemporaryDirectory();
    initializeProject("demo", cwd);
    writeProjectFrozenScript("demo", "current script", cwd);

    expect(() => writeProjectDirectorPlan("demo", createPlan("a".repeat(64)), cwd)).toThrow(
      "Director Plan source_script hash does not match the current frozen script",
    );
  });
});

function createPlan(sourceScriptSha256: string) {
  return {
    version: 1 as const,
    project_slug: "demo",
    source_script: {
      path: "content/frozen-script.md" as const,
      sha256: sourceScriptSha256,
    },
    style: { style_version: "1.0" },
    created_at: "2026-09-08T00:00:00.000Z",
    segments: [
      {
        id: "seg_001",
        semantic_role: "CLAIM" as const,
        time_range: { start_ms: 0, end_ms: 2_000 },
        visual: {
          selected: "talking_head" as const,
          allowed: ["talking_head" as const],
          forbidden: ["broll" as const],
        },
        caption: { mode: "default" as const, emphasis: [] },
        reason: "Keep the speaker visible while the core claim is established.",
        confidence: 0.9,
      },
    ],
  };
}

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-director-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
