import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  GrokApiProvider,
  GrokUiProvider,
  ManualProvider,
  MiniMaxApiProvider,
  OmniUiProvider,
} from "../src/providers/generated/index.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("P4 generated asset provider protocol", () => {
  it("keeps grok_ui separate from grok_api and marks missing API keys unavailable", async () => {
    const ui = new GrokUiProvider();
    const api = new GrokApiProvider({ api_key: undefined });
    const minimax = new MiniMaxApiProvider({ api_key: undefined });

    expect(ui.id).toBe("grok_ui");
    expect(api.id).toBe("grok_api");
    expect((await ui.capabilities()).automation).toBe("assisted");
    expect(await api.capabilities()).toMatchObject({ available: false, automation: "api" });
    expect(await minimax.capabilities()).toMatchObject({ available: false, automation: "api" });
  });

  it("writes a Grok UI prompt pack and waits until a matching local file appears", async () => {
    const projectDirectory = createProjectDirectory();
    const provider = new GrokUiProvider();
    const prepared = await provider.prepare(createRequest(projectDirectory));

    expect(prepared.prompt_pack_path).toContain("assets");
    expect(existsSync(prepared.prompt_pack_path!)).toBe(true);
    const waitingJob = await provider.submit(prepared);
    expect(waitingJob.status).toBe("WAITING_USER_ACTION");
    expect((await provider.poll(waitingJob)).status).toBe("WAITING_USER_ACTION");

    writeFileSync(join(waitingJob.collect_directory!, "asset_req_001.mp4"), "fixture", "utf8");
    expect((await provider.poll(waitingJob)).status).toBe("SUCCEEDED");
    expect(await provider.collect(waitingJob)).toMatchObject({
      source: "grok_ui",
      final_eligible: false,
      cash_cost_cny: 0,
      subscription_quota_used: true,
    });
  });

  it("keeps Omni and manual assets in local drop-folder workflows without final promotion", async () => {
    const projectDirectory = createProjectDirectory();
    const omni = new OmniUiProvider();
    const manual = new ManualProvider();

    expect(await omni.capabilities()).toMatchObject({
      automation: "assisted",
      has_watermark_risk: true,
    });
    expect(await manual.capabilities()).toMatchObject({ available: true, automation: "manual" });

    const prepared = await omni.prepare(createRequest(projectDirectory));
    const job = await omni.submit(prepared);
    writeFileSync(join(job.collect_directory!, "asset_req_001.mp4"), "fixture", "utf8");
    expect((await omni.collect(job)).final_eligible).toBe(false);
  });
});

function createProjectDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-provider-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createRequest(projectDirectory: string) {
  return {
    request_id: "asset_req_001",
    project_slug: "demo",
    project_directory: projectDirectory,
    asset: {
      asset_id: "asset_req_001",
      purpose: "concept_broll",
      priority: "medium" as const,
      description: "Show a generated concept shot.",
      preferred_source: "generated",
      fallback_source: "manual",
      generation: {
        provider_preference: ["grok_ui", "manual"],
        max_attempts: 1,
        cash_budget_cny: 0,
      },
    },
    prompt: "A short abstract concept shot.",
    target_duration_ms: 3_000,
    aspect_ratio: "9:16",
    reference_asset_paths: [],
  };
}
