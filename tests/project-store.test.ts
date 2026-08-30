import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initializeProject } from "../src/project/project-store.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("project initialization", () => {
  it("creates the P0 project layout with structured initial state", () => {
    const cwd = createTemporaryDirectory();
    const project = initializeProject("demo", cwd);

    expect(project.state).toEqual({ status: "CREATED" });
    expect(JSON.parse(readFileSync(join(project.directory, "project.json"), "utf8"))).toMatchObject({
      id: expect.any(String),
      slug: "demo",
      created_at: expect.any(String),
      budget: {
        generation_cash_cny: 10,
        used_cash_cny: 0,
        subscription_generation_count: 0,
      },
    });
    expect(JSON.parse(readFileSync(join(project.directory, "state.json"), "utf8"))).toEqual({
      status: "CREATED",
    });

    for (const directoryName of [
      "raw",
      "content",
      "derived",
      "assets",
      "plans",
      "review",
      "render",
      "publish",
    ]) {
      expect(existsSync(join(project.directory, directoryName))).toBe(true);
    }

    const [eventLine] = readFileSync(join(project.directory, "events.ndjson"), "utf8").trim().split("\n");
    expect(JSON.parse(eventLine!)).toMatchObject({
      stage: "init",
      event: "project_created",
      project: "demo",
    });
  });

  it("refuses a second initialization without replacing the first state", () => {
    const cwd = createTemporaryDirectory();
    const project = initializeProject("demo", cwd);
    const stateBefore = readFileSync(join(project.directory, "state.json"), "utf8");

    expect(() => initializeProject("demo", cwd)).toThrow("Project already exists: demo");
    expect(readFileSync(join(project.directory, "state.json"), "utf8")).toBe(stateBefore);
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
