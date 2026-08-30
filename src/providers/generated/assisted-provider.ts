import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";

import type { GeneratedAssetProviderId } from "../../contracts/assets.js";
import type {
  AssetGenerationRequest,
  GeneratedAsset,
  GeneratedAssetProvider,
  GenerationCostEstimate,
  GenerationJob,
  GenerationStatus,
  PreparedRequest,
  ProviderCapabilities,
} from "./types.js";

interface AssistedDropFolderProviderOptions {
  id: GeneratedAssetProviderId;
  automation: "assisted" | "manual";
  has_watermark_risk: boolean;
  subscription_quota_used: boolean;
}

/**
 * A local handoff provider. It writes a non-secret prompt pack and waits for a
 * Founder or local assistant to place the result in the project drop folder.
 */
export class AssistedDropFolderProvider implements GeneratedAssetProvider {
  readonly id: GeneratedAssetProviderId;

  private readonly automation: "assisted" | "manual";
  private readonly hasWatermarkRisk: boolean;
  private readonly subscriptionQuotaUsed: boolean;

  constructor(options: AssistedDropFolderProviderOptions) {
    this.id = options.id;
    this.automation = options.automation;
    this.hasWatermarkRisk = options.has_watermark_risk;
    this.subscriptionQuotaUsed = options.subscription_quota_used;
  }

  async capabilities(): Promise<ProviderCapabilities> {
    return {
      available: true,
      automation: this.automation,
      supports_text_to_video: true,
      supports_image_to_video: true,
      supports_reference: true,
      supports_edit_video: false,
      has_watermark_risk: this.hasWatermarkRisk,
    };
  }

  async estimate(_request: AssetGenerationRequest): Promise<GenerationCostEstimate> {
    return {
      cash_cost_cny: 0,
      subscription_quota_used: this.subscriptionQuotaUsed,
    };
  }

  async prepare(request: AssetGenerationRequest): Promise<PreparedRequest> {
    const generatedDirectory = resolveGeneratedDirectory(request.project_directory);
    const requestsDirectory = join(generatedDirectory, "requests");
    const collectDirectory = join(generatedDirectory, "collect", this.id);
    mkdirSync(requestsDirectory, { recursive: true });
    mkdirSync(collectDirectory, { recursive: true });

    const promptPackPath = join(requestsDirectory, `${request.request_id}.${this.id}.json`);
    const promptPack = {
      version: 1,
      provider: this.id,
      request_id: request.request_id,
      asset_id: request.asset.asset_id,
      purpose: request.asset.purpose,
      description: request.asset.description,
      prompt: request.prompt,
      target_duration_ms: request.target_duration_ms,
      aspect_ratio: request.aspect_ratio,
      reference_asset_paths: request.reference_asset_paths,
      collect_directory: toProjectRelativePath(request.project_directory, collectDirectory),
    };
    writeFileSync(promptPackPath, `${JSON.stringify(promptPack, null, 2)}\n`, "utf8");

    return {
      id: request.request_id,
      provider_id: this.id,
      request,
      prompt_pack_path: promptPackPath,
      collect_directory: collectDirectory,
    };
  }

  async submit(request: PreparedRequest): Promise<GenerationJob> {
    return waitingJob(request, this.id);
  }

  async poll(job: GenerationJob): Promise<GenerationStatus> {
    return findCollectedFile(job) === undefined
      ? { status: "WAITING_USER_ACTION", detail: "Waiting for a file in the local collect directory" }
      : { status: "SUCCEEDED" };
  }

  async collect(job: GenerationJob): Promise<GeneratedAsset> {
    const collectedPath = findCollectedFile(job);
    if (collectedPath === undefined) {
      throw new Error(`No collected asset is available for request: ${job.id}`);
    }

    return {
      request_id: job.id,
      asset_id: job.request.asset.asset_id,
      type: assetTypeFromPath(collectedPath),
      source: this.id,
      absolute_path: collectedPath,
      relative_path: toProjectRelativePath(job.request.project_directory, collectedPath),
      has_watermark: this.hasWatermarkRisk,
      // Collected media must still pass the later review gate. Omni therefore
      // cannot become final merely by arriving in the drop folder.
      final_eligible: false,
      cash_cost_cny: 0,
      subscription_quota_used: this.subscriptionQuotaUsed,
    };
  }
}

function waitingJob(request: PreparedRequest, providerId: GeneratedAssetProviderId): GenerationJob {
  return {
    id: request.id,
    provider_id: providerId,
    request: request.request,
    status: "WAITING_USER_ACTION",
    collect_directory: request.collect_directory,
    detail: "Place the generated file in the local collect directory, then rerun generation.",
  };
}

function findCollectedFile(job: GenerationJob): string | undefined {
  if (job.collect_directory === undefined || !existsSync(job.collect_directory)) {
    return undefined;
  }

  const filePrefix = `${job.id}.`;
  return readdirSync(job.collect_directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (entry.name === job.id || entry.name.startsWith(filePrefix)))
    .map((entry) => join(job.collect_directory!, entry.name))
    .sort()[0];
}

function resolveGeneratedDirectory(projectDirectory: string): string {
  const resolvedProject = resolve(projectDirectory);
  const generatedDirectory = resolve(resolvedProject, "assets", "generated");
  const relativeGenerated = relative(resolvedProject, generatedDirectory);

  if (
    relativeGenerated === "" ||
    relativeGenerated === ".." ||
    relativeGenerated.startsWith(`..${sep}`) ||
    relativeGenerated.startsWith("../")
  ) {
    throw new Error("Generated asset directories must stay inside the project directory");
  }

  return generatedDirectory;
}

function toProjectRelativePath(projectDirectory: string, path: string): string {
  return relative(resolve(projectDirectory), path).split(sep).join("/");
}

function assetTypeFromPath(path: string): GeneratedAsset["type"] {
  const extension = extname(basename(path)).toLowerCase();
  if ([".mp4", ".mov", ".mkv", ".webm", ".avi"].includes(extension)) {
    return "video";
  }
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension)) {
    return "image";
  }
  if ([".wav", ".mp3", ".m4a", ".aac", ".flac"].includes(extension)) {
    return "audio";
  }
  return "other";
}
