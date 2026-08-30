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

export interface FakeGeneratedAssetProviderOptions {
  id: GeneratedAssetProviderId;
  capabilities?: Partial<ProviderCapabilities>;
  estimate?: GenerationCostEstimate;
  status?: GenerationStatus;
  asset?: Omit<GeneratedAsset, "request_id" | "asset_id" | "source">;
}

/** A deterministic, network-free provider for P4 routing and CLI tests. */
export class FakeGeneratedAssetProvider implements GeneratedAssetProvider {
  readonly id: GeneratedAssetProviderId;
  readonly prepared: PreparedRequest[] = [];
  readonly submitted: PreparedRequest[] = [];

  private readonly configuredCapabilities: ProviderCapabilities;
  private readonly configuredEstimate: GenerationCostEstimate;
  private readonly configuredStatus: GenerationStatus;
  private readonly configuredAsset: Omit<GeneratedAsset, "request_id" | "asset_id" | "source"> | undefined;

  constructor(options: FakeGeneratedAssetProviderOptions) {
    this.id = options.id;
    this.configuredCapabilities = {
      available: true,
      automation: "api",
      supports_text_to_video: true,
      supports_image_to_video: true,
      supports_reference: true,
      supports_edit_video: false,
      has_watermark_risk: false,
      ...options.capabilities,
    };
    this.configuredEstimate = options.estimate ?? {
      cash_cost_cny: 0,
      subscription_quota_used: false,
    };
    this.configuredStatus = options.status ?? { status: "SUCCEEDED" };
    this.configuredAsset = options.asset;
  }

  async capabilities(): Promise<ProviderCapabilities> {
    return this.configuredCapabilities;
  }

  async estimate(_request: AssetGenerationRequest): Promise<GenerationCostEstimate> {
    return this.configuredEstimate;
  }

  async prepare(request: AssetGenerationRequest): Promise<PreparedRequest> {
    const prepared = { id: request.request_id, provider_id: this.id, request };
    this.prepared.push(prepared);
    return prepared;
  }

  async submit(request: PreparedRequest): Promise<GenerationJob> {
    this.submitted.push(request);
    return {
      id: request.id,
      provider_id: this.id,
      request: request.request,
      status: this.configuredStatus.status,
      detail: this.configuredStatus.detail,
    };
  }

  async poll(_job: GenerationJob): Promise<GenerationStatus> {
    return this.configuredStatus;
  }

  async collect(job: GenerationJob): Promise<GeneratedAsset> {
    if (this.configuredAsset === undefined) {
      throw new Error(`Fake provider ${this.id} has no collected asset configured`);
    }

    return {
      request_id: job.id,
      asset_id: job.request.asset.asset_id,
      source: this.id,
      ...this.configuredAsset,
    };
  }
}
