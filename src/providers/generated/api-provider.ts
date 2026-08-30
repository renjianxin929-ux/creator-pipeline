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

interface ApiProviderOptions {
  id: "grok_api" | "minimax_api";
  api_key?: string;
  run_live?: boolean;
  estimated_cash_cost_cny?: number;
}

/**
 * The protocol is ready for a future live transport, but P4 deliberately does
 * not issue HTTP requests. This keeps normal tests and a missing local key
 * safely offline.
 */
export class ApiProviderStub implements GeneratedAssetProvider {
  readonly id: GeneratedAssetProviderId;

  private readonly apiKey: string | undefined;
  private readonly runLive: boolean;
  private readonly estimatedCashCostCny: number | undefined;

  constructor(options: ApiProviderOptions) {
    this.id = options.id;
    this.apiKey = options.api_key;
    this.runLive = options.run_live ?? process.env.RUN_LIVE === "1";
    this.estimatedCashCostCny = options.estimated_cash_cost_cny;
  }

  async capabilities(): Promise<ProviderCapabilities> {
    if (this.apiKey === undefined || this.apiKey.length === 0) {
      return unavailableCapabilities("API key is not configured locally");
    }
    if (!this.runLive) {
      return unavailableCapabilities("Live API calls are disabled; set RUN_LIVE=1 for an explicit smoke run");
    }

    return {
      available: true,
      automation: "api",
      supports_text_to_video: true,
      supports_image_to_video: true,
      supports_reference: true,
      supports_edit_video: false,
      has_watermark_risk: false,
    };
  }

  async estimate(_request: AssetGenerationRequest): Promise<GenerationCostEstimate> {
    if (this.estimatedCashCostCny === undefined) {
      throw new Error(`No independent cost metadata is configured for ${this.id}`);
    }

    return {
      cash_cost_cny: this.estimatedCashCostCny,
      subscription_quota_used: false,
    };
  }

  async prepare(request: AssetGenerationRequest): Promise<PreparedRequest> {
    return {
      id: request.request_id,
      provider_id: this.id,
      request,
    };
  }

  async submit(request: PreparedRequest): Promise<GenerationJob> {
    return {
      id: request.id,
      provider_id: this.id,
      request: request.request,
      status: "WAITING_USER_ACTION",
      detail: "Live API transport is not implemented in P4; no HTTP request was sent.",
    };
  }

  async poll(job: GenerationJob): Promise<GenerationStatus> {
    return { status: job.status, detail: job.detail };
  }

  async collect(job: GenerationJob): Promise<GeneratedAsset> {
    throw new Error(`No generated asset is available for ${job.id}; no live API call was made.`);
  }
}

export class GrokApiProvider extends ApiProviderStub {
  constructor(options: Omit<ApiProviderOptions, "id"> = {}) {
    super({ id: "grok_api", api_key: process.env.XAI_API_KEY, ...options });
  }
}

export class MiniMaxApiProvider extends ApiProviderStub {
  constructor(options: Omit<ApiProviderOptions, "id"> = {}) {
    super({ id: "minimax_api", api_key: process.env.MINIMAX_API_KEY, ...options });
  }
}

function unavailableCapabilities(reason: string): ProviderCapabilities {
  return {
    available: false,
    automation: "api",
    supports_text_to_video: true,
    supports_image_to_video: true,
    supports_reference: true,
    supports_edit_video: false,
    has_watermark_risk: false,
    unavailable_reason: reason,
  };
}
