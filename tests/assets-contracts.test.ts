import { describe, expect, it } from "vitest";

import {
  assetManifestRecordSchema,
  assetPlanSchema,
  projectGenerationBudgetSchema,
} from "../src/contracts/assets.ts";

describe("P4 asset and generation contracts", () => {
  const request = {
    asset_id: "asset_req_001",
    timeline_hint: { start_ms: 1_000, end_ms: 4_000 },
    purpose: "concept_broll",
    priority: "medium" as const,
    description: "Show a creator coordinating connected tools.",
    preferred_source: "generated",
    fallback_source: "brand_motion",
    generation: {
      provider_preference: ["grok_ui", "minimax_api", "omni_ui", "manual"],
      max_attempts: 2,
      cash_budget_cny: 4,
    },
  };

  it("accepts a normalized asset plan with known provider ids", () => {
    expect(
      assetPlanSchema.parse({
        version: 1,
        project_slug: "demo",
        generated_at: "2026-08-30T00:00:00.000Z",
        requests: [request],
      }),
    ).toMatchObject({ project_slug: "demo", requests: [request] });
  });

  it("rejects provider ids outside the shared contract", () => {
    expect(() =>
      assetPlanSchema.parse({
        version: 1,
        project_slug: "demo",
        generated_at: "2026-08-30T00:00:00.000Z",
        requests: [
          {
            ...request,
            generation: {
              ...request.generation,
              provider_preference: ["unknown_provider"],
            },
          },
        ],
      }),
    ).toThrow();
  });

  it("marks Omni assets non-final when the manifest omits an explicit decision", () => {
    const asset = assetManifestRecordSchema.parse({
      asset_id: "asset_001",
      type: "video",
      source: "omni_ui",
      role: "concept_broll",
      path: "assets/generated/asset_001.mp4",
      has_watermark: true,
      generation: {
        attempt: 1,
        cash_cost_cny: 0,
        subscription_quota_used: false,
      },
    });

    expect(asset.final_eligible).toBe(false);
  });

  it("defaults every new project to the contract cash budget", () => {
    expect(projectGenerationBudgetSchema.parse({})).toEqual({
      generation_cash_cny: 10,
      used_cash_cny: 0,
      subscription_generation_count: 0,
    });
  });
});
