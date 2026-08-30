import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const cliPath = resolve(process.cwd(), "dist", "cli", "creator.js");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("creator CLI", () => {
  it("initializes and reports JSON state in a configured temporary workspace", () => {
    const cwd = createTemporaryDirectory();
    writeFileSync(
      join(cwd, "creator.config.json"),
      JSON.stringify({ workspace: "./temporary-workspace" }),
      "utf8",
    );

    const initialized = runCreator(cwd, ["init", "demo"]);
    expect(initialized.status).toBe(0);
    expect(initialized.stdout).toContain("CREATED demo");

    const statePath = join(cwd, "temporary-workspace", "projects", "demo", "state.json");
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({ status: "CREATED" });

    writeFileSync(statePath, `${JSON.stringify({ status: "FAILED" })}\n`, "utf8");
    const status = runCreator(cwd, ["status", "demo"]);
    expect(status.status).toBe(0);
    expect(status.stdout).toBe("demo: FAILED\n");

    const repeatedInit = runCreator(cwd, ["init", "demo"]);
    expect(repeatedInit.status).toBe(1);
    expect(repeatedInit.stderr).toContain("Project already exists: demo");
  });

  it("keeps doctor successful when MiniMax is not configured", () => {
    const cwd = createTemporaryDirectory();
    const doctor = runCreator(cwd, ["doctor"]);

    expect(doctor.status).toBe(0);
    expect(doctor.stdout).toContain("WARN minimax disabled");
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-cli-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function runCreator(cwd: string, arguments_: readonly string[]) {
  const environment = { ...process.env };
  delete environment.MINIMAX_API_KEY;

  return spawnSync(process.execPath, [cliPath, ...arguments_], {
    cwd,
    encoding: "utf8",
    env: environment,
  });
}
