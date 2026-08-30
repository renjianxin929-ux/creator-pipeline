import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

  it("binds a new project to the current brand and resolves it without copying the kit", () => {
    const cwd = createTemporaryDirectory();
    writeFileSync(
      join(cwd, "creator.config.json"),
      JSON.stringify({ workspace: "./temporary-workspace" }),
      "utf8",
    );
    const kitColorsPath = resolve(process.cwd(), "brand", "v1.0", "tokens", "colors.json");
    const kitBefore = readFileSync(kitColorsPath, "utf8");

    expect(runCreator(cwd, ["init", "brand-demo"]).status).toBe(0);
    const projectDirectory = join(cwd, "temporary-workspace", "projects", "brand-demo");
    const projectPath = join(projectDirectory, "project.json");
    const project = JSON.parse(readFileSync(projectPath, "utf8")) as Record<string, unknown>;
    expect(project.brand_version).toBe("1.0");

    project.brand_override = { colors: { accent: "#ef4444" }, caption_max_lines: 3 };
    project.brand_templates = { layout: "layout.screen-demo" };
    writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");

    const brand = runCreator(cwd, ["brand", "brand-demo"]);
    expect(brand.status).toBe(0);
    expect(JSON.parse(brand.stdout)).toMatchObject({
      brand_version: "1.0",
      template_defaults: { layout: "layout.screen-demo" },
      brand_override: { caption_max_lines: 3 },
    });
    expect(brand.stdout).toContain("cover.tutorial");
    expect(readFileSync(kitColorsPath, "utf8")).toBe(kitBefore);
    expect(existsSync(join(projectDirectory, "brand"))).toBe(false);
  });

  it("reports a clean error and preserves CREATED state when ffprobe cannot provide a probe", () => {
    const cwd = createTemporaryDirectory();
    writeFileSync(
      join(cwd, "creator.config.json"),
      JSON.stringify({ workspace: "./temporary-workspace" }),
      "utf8",
    );
    const inputPath = join(cwd, "input.mp4");
    const unavailableToolDirectory = join(cwd, "unavailable-tools");
    const unavailableFfprobePath = join(
      unavailableToolDirectory,
      process.platform === "win32" ? "ffprobe.exe" : "ffprobe",
    );
    writeFileSync(inputPath, "not media", "utf8");
    mkdirSync(unavailableToolDirectory);
    copyFileSync(process.execPath, unavailableFfprobePath);
    chmodSync(unavailableFfprobePath, 0o755);

    expect(runCreator(cwd, ["init", "demo"]).status).toBe(0);

    const ingest = runCreator(cwd, ["ingest", "demo", inputPath], { path: unavailableToolDirectory });
    const statePath = join(cwd, "temporary-workspace", "projects", "demo", "state.json");

    expect(ingest.status).toBe(1);
    expect(ingest.stderr).toContain("ffprobe returned invalid JSON");
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({ status: "CREATED" });
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-cli-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function runCreator(
  cwd: string,
  arguments_: readonly string[],
  options: { path?: string } = {},
) {
  const environment = { ...process.env };
  delete environment.MINIMAX_API_KEY;

  if (options.path !== undefined) {
    const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === "path") ?? "Path";
    for (const key of Object.keys(environment)) {
      if (key.toLowerCase() === "path") {
        delete environment[key];
      }
    }
    environment[pathKey] = options.path;
  }

  return spawnSync(process.execPath, [cliPath, ...arguments_], {
    cwd,
    encoding: "utf8",
    env: environment,
  });
}
