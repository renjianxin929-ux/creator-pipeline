import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  defaultAssetProviderPreference,
  planProjectAssets,
} from "../src/assets/asset-planner.ts";
import {
  GeneratedAssetProviderRouter,
  applyGenerationEstimate,
  evaluateGenerationBudget,
} from "../src/assets/provider-router.ts";
import { createDefaultProjectGenerationBudget } from "../src/contracts/assets.ts";
import { readProjectState } from "../src/project/project-store.ts";
import { initializeProject } from "../src/project/project-store.ts";
import { FakeGeneratedAssetProvider } from "../src/providers/generated/index.ts";

const temporaryDirectories: string[] = [];
const cliPath = resolve(process.cwd(), "dist", "cli", "creator.js");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("P4 asset planner", () => {
  it("writes a deterministic plan without changing collected assets and allows a rerun", () => {
    const { cwd, projectDirectory } = createTranscribedProject();
    const manifestPath = join(projectDirectory, "assets", "manifest.json");
    const manifestBefore = '{"assets":["already-collected"]}\n';
    writeFileSync(manifestPath, manifestBefore, "utf8");

    const firstPlan = planProjectAssets("demo", cwd, {
      now: new Date("2026-08-30T00:00:00.000Z"),
    });
    const secondPlan = planProjectAssets("demo", cwd, {
      now: new Date("2026-08-30T00:01:00.000Z"),
    });
    const persistedPlan = JSON.parse(
      readFileSync(join(projectDirectory, "plans", "asset-plan.json"), "utf8"),
    ) as { requests: Array<{ generation: { provider_preference: string[] } }> };

    expect(firstPlan.requests).toHaveLength(2);
    expect(secondPlan.requests.map((request) => request.asset_id)).toEqual(
      firstPlan.requests.map((request) => request.asset_id),
    );
    expect(persistedPlan.requests[0]!.generation.provider_preference).toEqual(
      defaultAssetProviderPreference,
    );
    expect(readFileSync(manifestPath, "utf8")).toBe(manifestBefore);
    expect(readProjectState("demo", cwd)).toEqual({ status: "ASSET_PLAN_READY" });
  });

  it("exposes creator assets plan and writes plans/asset-plan.json", () => {
    const { cwd, projectDirectory } = createTranscribedProject();
    const result = spawnSync(process.execPath, [cliPath, "assets", "plan", "demo"], {
      cwd,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("ASSET_PLAN_READY demo 2\n");
    expect(JSON.parse(readFileSync(join(projectDirectory, "plans", "asset-plan.json"), "utf8"))).toMatchObject({
      project_slug: "demo",
      requests: expect.any(Array),
    });
  });
});

describe("P4 provider router and budget", () => {
  it("routes past an unavailable Grok UI provider without treating it as Grok API", async () => {
    const grokUi = new FakeGeneratedAssetProvider({
      id: "grok_ui",
      capabilities: { available: false, automation: "assisted" },
    });
    const minimax = new FakeGeneratedAssetProvider({
      id: "minimax_api",
      estimate: { cash_cost_cny: 2, subscription_quota_used: false },
    });
    const router = new GeneratedAssetProviderRouter([grokUi, minimax]);

    const route = await router.route(createGenerationRequest(), createDefaultProjectGenerationBudget());

    expect(route).toMatchObject({ status: "ROUTED", provider_id: "minimax_api" });
    expect(grokUi.submitted).toHaveLength(0);
    expect(minimax.submitted).toHaveLength(0);
  });

  it("refuses a 20 CNY estimate before any paid provider can submit", async () => {
    const minimax = new FakeGeneratedAssetProvider({
      id: "minimax_api",
      estimate: { cash_cost_cny: 20, subscription_quota_used: false },
    });
    const router = new GeneratedAssetProviderRouter([minimax]);
    const request = createGenerationRequest(["minimax_api"]);
    const budget = createDefaultProjectGenerationBudget();

    const route = await router.route(request, budget);
    const decision = evaluateGenerationBudget(budget, { cash_cost_cny: 20, subscription_quota_used: false }, request);

    expect(route).toMatchObject({ status: "WAITING_USER_ACTION", provider_id: "minimax_api" });
    expect(minimax.prepared).toHaveLength(0);
    expect(minimax.submitted).toHaveLength(0);
    expect(decision).toMatchObject({ allowed: false, remaining_cash_cny: 10 });
    expect(() =>
      applyGenerationEstimate(budget, { cash_cost_cny: 20, subscription_quota_used: false }, request),
    ).toThrow("exceeds remaining project budget");
  });
});

function createTranscribedProject(): { cwd: string; projectDirectory: string } {
  const cwd = mkdtempSync(join(tmpdir(), "creator-pipeline-asset-planner-test-"));
  temporaryDirectories.push(cwd);
  const project = initializeProject("demo", cwd);

  writeFileSync(join(project.directory, "state.json"), '{"status":"TRANSCRIBED"}\n', "utf8");
  writeFileSync(
    join(project.directory, "derived", "transcript.json"),
    `${JSON.stringify({
      source_media_id: "sha256:transcript-fixture",
      language: "zh",
      segments: [
        {
          id: "seg_001",
          start_ms: 0,
          end_ms: 15_000,
          speaker: "spk_0",
          text: "Explain the creator workflow.",
          confidence: 0.9,
        },
        {
          id: "seg_002",
          start_ms: 15_000,
          end_ms: 70_000,
          speaker: "spk_0",
          text: "Show the generated asset fallback policy.",
          confidence: 0.9,
        },
      ],
    }, null, 2)}\n`,
    "utf8",
  );

  return { cwd, projectDirectory: project.directory };
}

function createGenerationRequest(providerPreference = [...defaultAssetProviderPreference]) {
  return {
    request_id: "asset_req_001",
    project_slug: "demo",
    project_directory: "C:/temporary/demo",
    asset: {
      asset_id: "asset_req_001",
      purpose: "concept_broll",
      priority: "medium" as const,
      description: "Show a routing decision.",
      preferred_source: "generated",
      fallback_source: "manual",
      generation: {
        provider_preference: providerPreference,
        max_attempts: 2,
        cash_budget_cny: 20,
      },
    },
    prompt: "Show a routing decision.",
    reference_asset_paths: [],
  };
}
