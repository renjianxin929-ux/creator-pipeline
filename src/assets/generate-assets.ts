import {
  assetManifestRecordSchema,
  type AssetManifest,
  type AssetManifestRecord,
  type AssetPlan,
  type AssetRequest,
  type ProjectGenerationBudget,
} from "../contracts/index.js";
import {
  appendProjectEvent,
  readProjectAssetManifest,
  readProjectAssetPlan,
  readProjectIdentity,
  readProjectState,
  resolveProjectDirectory,
  transitionProjectState,
  writeProjectAssetManifest,
  writeProjectGenerationBudget,
} from "../project/project-store.js";
import type {
  AssetGenerationRequest,
  GeneratedAsset,
  GeneratedAssetProvider,
} from "../providers/generated/index.js";
import { applyGenerationEstimate, GeneratedAssetProviderRouter } from "./provider-router.js";
import { createDefaultGeneratedAssetProviders } from "./provider-registry.js";

export type AssetGenerationResultStatus = "ASSETS_READY" | "WAITING_USER_ACTION";

export interface AssetGenerationResult {
  status: AssetGenerationResultStatus;
  plan?: AssetPlan;
  manifest: AssetManifest;
  budget: ProjectGenerationBudget;
  reason?: string;
}

export interface GenerateProjectAssetsOptions {
  providers?: readonly GeneratedAssetProvider[];
}

export class AssetGenerationError extends Error {
  override name = "AssetGenerationError";
}

/**
 * Executes a previously written asset plan. Provider selection and cost
 * validation happen before prepare/submit, so an over-budget paid request is
 * never submitted. The default provider set is entirely offline in P4.
 */
export async function generateProjectAssets(
  slug: string,
  cwd = process.cwd(),
  options: GenerateProjectAssetsOptions = {},
): Promise<AssetGenerationResult> {
  const currentState = readProjectState(slug, cwd);
  if (currentState.status !== "ASSET_PLAN_READY" && currentState.status !== "WAITING_USER_ACTION") {
    throw new AssetGenerationError(
      `Project ${slug} must be ASSET_PLAN_READY before asset generation; current state is ${currentState.status}`,
    );
  }

  const plan = readProjectAssetPlan(slug, cwd);
  const initialManifest = readProjectAssetManifest(slug, cwd);
  const initialBudget = readProjectIdentity(slug, cwd).budget;
  if (plan === undefined) {
    return waitForUserAction(
      slug,
      currentState.status,
      { version: 1, assets: initialManifest.assets },
      initialBudget,
      "Asset generation is waiting for plans/asset-plan.json. Run creator assets plan, then rerun creator assets generate.",
      cwd,
      undefined,
    );
  }

  const router = new GeneratedAssetProviderRouter(
    options.providers ?? createDefaultGeneratedAssetProviders(),
  );
  const projectDirectory = resolveProjectDirectory(slug, cwd);
  let manifest = initialManifest;
  let budget = initialBudget;

  try {
    for (const request of requiredGeneratedRequests(plan)) {
      if (manifest.assets.some((asset) => asset.asset_id === request.asset_id)) {
        continue;
      }

      const generationRequest = createAssetGenerationRequest(slug, projectDirectory, request);
      const route = await router.route(generationRequest, budget);
      if (route.status === "WAITING_USER_ACTION") {
        return waitForUserAction(
          slug,
          currentState.status,
          manifest,
          budget,
          route.reason,
          cwd,
          route.provider_id,
          generationRequest.request_id,
          plan,
        );
      }

      const prepared = await route.provider.prepare(generationRequest);
      const job = await route.provider.submit(prepared);
      const status = await route.provider.poll(job);
      if (status.status === "WAITING_USER_ACTION") {
        return waitForUserAction(
          slug,
          currentState.status,
          manifest,
          budget,
          status.detail ?? "Provider is waiting for user action",
          cwd,
          route.provider_id,
          generationRequest.request_id,
          plan,
        );
      }
      if (status.status !== "SUCCEEDED") {
        return waitForUserAction(
          slug,
          currentState.status,
          manifest,
          budget,
          status.detail ?? `Provider status is ${status.status}`,
          cwd,
          route.provider_id,
          generationRequest.request_id,
          plan,
        );
      }

      const collected = await route.provider.collect(job);
      assertCollectedAssetMatchesRoute(
        collected,
        route.provider_id,
        generationRequest.request_id,
        request.asset_id,
      );
      if (collected.cash_cost_cny > route.estimate.cash_cost_cny) {
        throw new AssetGenerationError(
          `Provider ${route.provider_id} reported ${collected.cash_cost_cny} CNY after estimating ${route.estimate.cash_cost_cny} CNY`,
        );
      }

      budget = applyGenerationEstimate(budget, {
        cash_cost_cny: collected.cash_cost_cny,
        subscription_quota_used: collected.subscription_quota_used,
      }, generationRequest);
      manifest = upsertManifestAsset(manifest, createManifestRecord(request, collected));
      writeProjectAssetManifest(slug, manifest, cwd);
      writeProjectGenerationBudget(slug, budget, cwd);
      appendProjectEvent(slug, {
        ts: new Date().toISOString(),
        stage: "asset_generation",
        event: "asset_collected",
        project: slug,
        provider: route.provider_id,
        request_id: generationRequest.request_id,
      }, cwd);
    }

    writeProjectAssetManifest(slug, manifest, cwd);
    transitionProjectState(slug, "ASSETS_READY", cwd);
    appendProjectEvent(slug, {
      ts: new Date().toISOString(),
      stage: "asset_generation",
      event: "assets_ready",
      project: slug,
    }, cwd);
    return { status: "ASSETS_READY", plan, manifest, budget };
  } catch (error) {
    appendProjectEvent(slug, {
      ts: new Date().toISOString(),
      stage: "asset_generation",
      event: "asset_generation_failed",
      project: slug,
    }, cwd);
    transitionProjectState(slug, "FAILED", cwd);
    const message = error instanceof Error ? error.message : "Asset generation failed";
    throw new AssetGenerationError(message);
  }
}

function requiredGeneratedRequests(plan: AssetPlan): readonly AssetRequest[] {
  return plan.requests.filter(
    (request) => request.preferred_source === "generated" && request.generation !== undefined,
  );
}

function createAssetGenerationRequest(
  slug: string,
  projectDirectory: string,
  request: AssetRequest,
): AssetGenerationRequest {
  return {
    request_id: request.asset_id,
    project_slug: slug,
    project_directory: projectDirectory,
    asset: request,
    prompt: `${request.description}\nPurpose: ${request.purpose}`,
    target_duration_ms:
      request.timeline_hint === undefined
        ? undefined
        : request.timeline_hint.end_ms - request.timeline_hint.start_ms,
    aspect_ratio: "9:16",
    reference_asset_paths: [],
  };
}

function createManifestRecord(request: AssetRequest, asset: GeneratedAsset): AssetManifestRecord {
  return assetManifestRecordSchema.parse({
    asset_id: asset.asset_id,
    type: asset.type,
    source: asset.source,
    role: request.purpose,
    path: asset.relative_path,
    has_watermark: asset.has_watermark,
    // P4 may collect a file, but no provider can promote it to final here.
    final_eligible: false,
    generation: {
      attempt: 1,
      cash_cost_cny: asset.cash_cost_cny,
      subscription_quota_used: asset.subscription_quota_used,
    },
  });
}

function upsertManifestAsset(manifest: AssetManifest, asset: AssetManifestRecord): AssetManifest {
  const existingIndex = manifest.assets.findIndex((existing) => existing.asset_id === asset.asset_id);
  if (existingIndex === -1) {
    return { ...manifest, assets: [...manifest.assets, asset] };
  }

  return {
    ...manifest,
    assets: manifest.assets.map((existing, index) => (index === existingIndex ? asset : existing)),
  };
}

function assertCollectedAssetMatchesRoute(
  asset: GeneratedAsset,
  providerId: string,
  requestId: string,
  assetId: string,
): void {
  if (asset.source !== providerId) {
    throw new AssetGenerationError(`Collected asset source ${asset.source} does not match routed provider ${providerId}`);
  }
  if (asset.request_id !== requestId) {
    throw new AssetGenerationError(`Collected asset request ${asset.request_id} does not match ${requestId}`);
  }
  if (asset.asset_id !== assetId) {
    throw new AssetGenerationError(`Collected asset id ${asset.asset_id} does not match ${assetId}`);
  }
}

function waitForUserAction(
  slug: string,
  currentStatus: "ASSET_PLAN_READY" | "WAITING_USER_ACTION",
  manifest: AssetManifest,
  budget: ProjectGenerationBudget,
  reason: string,
  cwd: string,
  provider?: string,
  requestId?: string,
  plan?: AssetPlan,
): AssetGenerationResult {
  writeProjectAssetManifest(slug, manifest, cwd);
  appendProjectEvent(slug, {
    ts: new Date().toISOString(),
    stage: "asset_generation",
    event: "waiting_user_action",
    project: slug,
    provider,
    request_id: requestId,
  }, cwd);
  if (currentStatus !== "WAITING_USER_ACTION") {
    transitionProjectState(slug, "WAITING_USER_ACTION", cwd);
  }

  return { status: "WAITING_USER_ACTION", plan, manifest, budget, reason };
}
