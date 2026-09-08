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

  it("refuses approval when the PREVIEW_READY artifact is missing", () => {
    const cwd = createTemporaryDirectory();
    writeFileSync(
      join(cwd, "creator.config.json"),
      JSON.stringify({ workspace: "./temporary-workspace" }),
      "utf8",
    );
    expect(runCreator(cwd, ["init", "demo"]).status).toBe(0);

    const statePath = join(cwd, "temporary-workspace", "projects", "demo", "state.json");
    writeFileSync(statePath, '{"status":"PREVIEW_READY"}\n', "utf8");

    const approved = runCreator(cwd, ["approve", "demo"]);
    expect(approved.status).toBe(1);
    expect(approved.stderr).toContain("render/preview.mp4 is missing");
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({ status: "WAITING_USER_ACTION" });
  });

  it("approves a preview, exports its exact bytes, and invalidates a stale approval", () => {
    const cwd = createTemporaryDirectory();
    writeFileSync(
      join(cwd, "creator.config.json"),
      JSON.stringify({ workspace: "./temporary-workspace" }),
      "utf8",
    );
    expect(runCreator(cwd, ["init", "demo"]).status).toBe(0);

    const projectDirectory = join(cwd, "temporary-workspace", "projects", "demo");
    const statePath = join(projectDirectory, "state.json");
    const previewPath = join(projectDirectory, "render", "preview.mp4");
    const approvalPath = join(projectDirectory, "review", "approval.json");
    writeFileSync(statePath, '{"status":"PREVIEW_READY"}\n', "utf8");
    writeFileSync(previewPath, Buffer.from("fixture preview v1"));
    writeFileSync(join(projectDirectory, "plans", "edit-plan.json"), '{"fixture":true}\n', "utf8");

    const beforeApproval = runCreator(cwd, ["export", "demo"]);
    expect(beforeApproval.status).toBe(1);
    expect(beforeApproval.stderr).toContain("must be HUMAN_APPROVED before export");

    const approved = runCreator(cwd, ["approve", "demo"]);
    expect(approved.status).toBe(0);
    expect(approved.stdout).toMatch(/^HUMAN_APPROVED demo [a-f0-9]{64}\r?\n$/);
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({ status: "HUMAN_APPROVED" });
    const approvalBeforeReapprove = readFileSync(approvalPath, "utf8");

    const reapproved = runCreator(cwd, ["approve", "demo"]);
    expect(reapproved.status).toBe(0);
    expect(readFileSync(approvalPath, "utf8")).toBe(approvalBeforeReapprove);

    const exported = runCreator(cwd, ["export", "demo"]);
    const masterPath = join(projectDirectory, "publish", "package", "master.mp4");
    const metadataPath = join(projectDirectory, "publish", "package", "metadata.json");
    expect(exported.status).toBe(0);
    expect(exported.stdout).toContain("EXPORT_READY demo");
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({ status: "EXPORT_READY" });
    expect(readFileSync(masterPath)).toEqual(readFileSync(previewPath));
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
      source: { preview_sha256: string };
      master: { sha256: string };
    };
    expect(metadata).toMatchObject({
      title: "",
      description: "",
      hashtags: [],
      source: {
        preview_path: "render/preview.mp4",
        preview_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        edit_plan_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      master: {
        path: "publish/package/master.mp4",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(metadata.master.sha256).toBe(metadata.source.preview_sha256);
    expect(existsSync(join(projectDirectory, "publish", "package", "cover.TODO"))).toBe(true);

    writeFileSync(previewPath, Buffer.from("fixture preview v2"));
    const staleExport = runCreator(cwd, ["export", "demo"]);
    expect(staleExport.status).toBe(1);
    expect(staleExport.stderr).toContain("approval is missing or stale");
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({ status: "PREVIEW_READY" });
    expect(existsSync(approvalPath)).toBe(false);
  });

  it("hands a director job to an external agent and applies the returned plan", () => {
    const cwd = createTemporaryDirectory();
    writeFileSync(
      join(cwd, "creator.config.json"),
      JSON.stringify({ workspace: "./temporary-workspace" }),
      "utf8",
    );
    expect(runCreator(cwd, ["init", "demo"]).status).toBe(0);

    const projectDirectory = join(cwd, "temporary-workspace", "projects", "demo");
    const frozenText = "# Demo\n\nLine two.\n";
    writeFileSync(join(projectDirectory, "content", "frozen-script.md"), frozenText, "utf8");

    const prepared = runCreator(cwd, ["director", "prepare", "demo"]);
    expect(prepared.status).toBe(0);
    expect(prepared.stdout).toContain("DIRECTOR_CONTEXT_READY demo");
    const storedContext = JSON.parse(
      readFileSync(join(projectDirectory, "plans", "director-context.json"), "utf8"),
    ) as {
      project_slug: string;
      project_id: string;
      frozen_script: { sha256: string; byte_size: number };
      style_version: string;
    };
    expect(storedContext.project_slug).toBe("demo");

    const externalPlan = {
      version: 1,
      project_slug: storedContext.project_slug,
      project_id: storedContext.project_id,
      frozen_script: {
        path: "content/frozen-script.md",
        sha256: storedContext.frozen_script.sha256,
        byte_size: storedContext.frozen_script.byte_size,
      },
      style_reference: { style_version: storedContext.style_version },
      segments: [
        {
          segment_id: "seg_01",
          script_anchor: { start_line: 1, end_line: 1 },
          semantic_role: "HOOK",
          primary_visual: "visual.hook.talking-head",
          allowed_visuals: ["visual.hook.talking-head"],
          caption_mode: "default",
          reason: "External director fixture.",
          confidence: 0.7,
        },
      ],
    };
    const externalPlanPath = join(cwd, "external-plan.json");
    writeFileSync(externalPlanPath, JSON.stringify(externalPlan, null, 2), "utf8");

    const imported = runCreator(cwd, ["director", "import", "demo", externalPlanPath]);
    expect(imported.status).toBe(0);
    expect(imported.stdout).toContain("DIRECTOR_PLAN_IMPORTED demo 1");

    writeFileSync(
      join(projectDirectory, "plans", "edit-plan.json"),
      JSON.stringify({
        version: 1,
        format: "9:16",
        timeline: [
          {
            id: "clip_001",
            source: "raw/camera/talk.mp4",
            source_start_ms: 0,
            source_end_ms: 2000,
            layout: "layout.talking-head",
            caption: false,
          },
        ],
      }),
      "utf8",
    );

    const applied = runCreator(cwd, ["director", "apply", "demo"]);
    expect(applied.status).toBe(0);
    expect(applied.stdout).toContain("DIRECTOR_APPLIED demo 1");
    expect(
      (JSON.parse(readFileSync(join(projectDirectory, "plans", "edit-plan.json"), "utf8")) as {
        timeline: { id: string }[];
      }).timeline.map((clip) => clip.id),
    ).toEqual(["clip_001"]);

    const reimported = runCreator(cwd, ["director", "import", "demo", externalPlanPath]);
    expect(reimported.status).toBe(0);

    writeFileSync(join(cwd, "bad-plan.json"), '{"version":1}\n', "utf8");
    const invalid = runCreator(cwd, ["director", "import", "demo", join(cwd, "bad-plan.json")]);
    expect(invalid.status).toBe(1);
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
