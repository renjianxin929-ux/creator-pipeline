import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { planProjectAssets } from "../src/assets/asset-planner.ts";
import { generateProjectAssets } from "../src/assets/generate-assets.ts";
import { initializeProject, readProjectState } from "../src/project/project-store.ts";
import { FakeGeneratedAssetProvider } from "../src/providers/generated/index.ts";

const temporaryDirectories: string[] = [];
const cliPath = resolve(process.cwd(), "dist", "cli", "creator.js");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("P4 assisted asset generation", () => {
  it("keeps a project in a controlled wait when the asset-plan artifact is missing", async () => {
    const { cwd, projectDirectory } = createTranscribedProject();
    writeFileSync(join(projectDirectory, "state.json"), '{"status":"ASSET_PLAN_READY"}\n', "utf8");

    const result = await generateProjectAssets("demo", cwd);

    expect(result).toMatchObject({ status: "WAITING_USER_ACTION", plan: undefined });
    expect(readProjectState("demo", cwd)).toEqual({ status: "WAITING_USER_ACTION" });
  });

  it("routes the default CLI to Grok UI assistance, writes prompt packs, and records collected files", () => {
    const { cwd, projectDirectory } = createTranscribedProject();
    const planned = runCreator(cwd, ["assets", "plan", "demo"]);
    expect(planned.status).toBe(0);

    const waiting = runCreator(cwd, ["assets", "generate", "demo"]);
    const identityPath = join(projectDirectory, "project.json");
    const manifestPath = join(projectDirectory, "assets", "manifest.json");
    const collectDirectory = join(projectDirectory, "assets", "generated", "collect", "grok_ui");

    expect(waiting.status).toBe(0);
    expect(waiting.stdout).toBe("WAITING_USER_ACTION demo 0\n");
    expect(readProjectState("demo", cwd)).toEqual({ status: "WAITING_USER_ACTION" });
    expect(readFileSync(join(projectDirectory, "assets", "generated", "requests", "asset_req_001.grok_ui.json"), "utf8"))
      .toContain('"provider": "grok_ui"');
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual({ version: 1, assets: [] });
    expect(JSON.parse(readFileSync(identityPath, "utf8")).budget).toMatchObject({
      used_cash_cny: 0,
      subscription_generation_count: 0,
    });

    writeFileSync(join(collectDirectory, "asset_req_001.mp4"), "fixture", "utf8");
    writeFileSync(join(collectDirectory, "asset_req_002.mp4"), "fixture", "utf8");

    const collected = runCreator(cwd, ["assets", "generate", "demo"]);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      assets: Array<{ source: string; final_eligible: boolean; generation: { cash_cost_cny: number } }>;
    };

    expect(collected.status).toBe(0);
    expect(collected.stdout).toBe("ASSETS_READY demo 2\n");
    expect(readProjectState("demo", cwd)).toEqual({ status: "ASSETS_READY" });
    expect(manifest.assets).toHaveLength(2);
    expect(manifest.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "grok_ui",
          final_eligible: false,
          generation: expect.objectContaining({ cash_cost_cny: 0 }),
        }),
      ]),
    );
    expect(JSON.parse(readFileSync(identityPath, "utf8")).budget).toMatchObject({
      used_cash_cny: 0,
      subscription_generation_count: 2,
    });
  });

  it("uses fake providers without network and leaves cash at zero", async () => {
    const { cwd, projectDirectory } = createTranscribedProject();
    planProjectAssets("demo", cwd);
    const generatedPath = join(projectDirectory, "assets", "generated", "fake.mp4");
    mkdirSync(join(projectDirectory, "assets", "generated"), { recursive: true });
    writeFileSync(generatedPath, "fixture", "utf8");
    const fakeGrokUi = new FakeGeneratedAssetProvider({
      id: "grok_ui",
      estimate: { cash_cost_cny: 0, subscription_quota_used: true },
      asset: {
        type: "video",
        absolute_path: generatedPath,
        relative_path: "assets/generated/fake.mp4",
        has_watermark: false,
        final_eligible: false,
        cash_cost_cny: 0,
        subscription_quota_used: true,
      },
    });

    const result = await generateProjectAssets("demo", cwd, { providers: [fakeGrokUi] });
    const identity = JSON.parse(readFileSync(join(projectDirectory, "project.json"), "utf8")) as {
      budget: { used_cash_cny: number; subscription_generation_count: number };
    };

    expect(result.status).toBe("ASSETS_READY");
    expect(fakeGrokUi.submitted).toHaveLength(2);
    expect(identity.budget).toEqual({
      generation_cash_cny: 10,
      used_cash_cny: 0,
      subscription_generation_count: 2,
    });
  });

  it("blocks an over-budget route before fake paid-provider preparation or submission", async () => {
    const { cwd } = createTranscribedProject();
    planProjectAssets("demo", cwd);
    const unavailableGrokUi = new FakeGeneratedAssetProvider({
      id: "grok_ui",
      capabilities: { available: false, automation: "assisted" },
    });
    const paidMiniMax = new FakeGeneratedAssetProvider({
      id: "minimax_api",
      estimate: { cash_cost_cny: 20, subscription_quota_used: false },
    });

    const result = await generateProjectAssets("demo", cwd, {
      providers: [unavailableGrokUi, paidMiniMax],
    });

    expect(result.status).toBe("WAITING_USER_ACTION");
    expect(readProjectState("demo", cwd)).toEqual({ status: "WAITING_USER_ACTION" });
    expect(paidMiniMax.prepared).toHaveLength(0);
    expect(paidMiniMax.submitted).toHaveLength(0);
  });
});

function createTranscribedProject(): { cwd: string; projectDirectory: string } {
  const cwd = mkdtempSync(join(tmpdir(), "creator-pipeline-asset-generate-test-"));
  temporaryDirectories.push(cwd);
  const project = initializeProject("demo", cwd);

  writeFileSync(join(project.directory, "state.json"), '{"status":"TRANSCRIBED"}\n', "utf8");
  writeFileSync(
    join(project.directory, "derived", "transcript.json"),
    `${JSON.stringify({
      source_media_id: "sha256:transcript-fixture",
      segments: [
        {
          id: "seg_001",
          start_ms: 0,
          end_ms: 15_000,
          speaker: "spk_0",
          text: "Explain the creator workflow.",
        },
        {
          id: "seg_002",
          start_ms: 15_000,
          end_ms: 70_000,
          speaker: "spk_0",
          text: "Show the generated asset fallback policy.",
        },
      ],
    }, null, 2)}\n`,
    "utf8",
  );

  return { cwd, projectDirectory: project.directory };
}

function runCreator(cwd: string, arguments_: readonly string[]) {
  return spawnSync(process.execPath, [cliPath, ...arguments_], {
    cwd,
    encoding: "utf8",
  });
}
