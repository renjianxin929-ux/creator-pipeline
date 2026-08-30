import type {
  AssetManifestType,
  AssetRequest,
  GeneratedAssetProviderId,
} from "../../contracts/assets.js";

export type ProviderAutomation = "api" | "browser" | "assisted" | "manual";

export interface ProviderCapabilities {
  available: boolean;
  automation: ProviderAutomation;
  supports_text_to_video: boolean;
  supports_image_to_video: boolean;
  supports_reference: boolean;
  supports_edit_video: boolean;
  has_watermark_risk: boolean;
  unavailable_reason?: string;
}

export interface AssetGenerationRequest {
  request_id: string;
  project_slug: string;
  project_directory: string;
  asset: AssetRequest;
  prompt: string;
  target_duration_ms?: number;
  aspect_ratio?: string;
  reference_asset_paths: readonly string[];
}

export interface PreparedRequest {
  id: string;
  provider_id: GeneratedAssetProviderId;
  request: AssetGenerationRequest;
  prompt_pack_path?: string;
  collect_directory?: string;
}

export type GenerationJobState =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "WAITING_USER_ACTION";

export interface GenerationJob {
  id: string;
  provider_id: GeneratedAssetProviderId;
  request: AssetGenerationRequest;
  status: GenerationJobState;
  collect_directory?: string;
  detail?: string;
}

export interface GenerationStatus {
  status: GenerationJobState;
  detail?: string;
}

export interface GeneratedAsset {
  request_id: string;
  asset_id: string;
  type: AssetManifestType;
  source: GeneratedAssetProviderId;
  absolute_path: string;
  relative_path: string;
  has_watermark: boolean;
  final_eligible: boolean;
  cash_cost_cny: number;
  subscription_quota_used: boolean;
}

export interface GenerationCostEstimate {
  cash_cost_cny: number;
  subscription_quota_used: boolean;
}

/**
 * This protocol deliberately gives both Grok paths distinct provider IDs.
 * grok_ui refers to Founder-operated web/app subscription quota; grok_api is
 * separately billed xAI API access and is never substituted automatically.
 */
export interface GeneratedAssetProvider {
  readonly id: GeneratedAssetProviderId;
  capabilities(): Promise<ProviderCapabilities>;
  estimate(request: AssetGenerationRequest): Promise<GenerationCostEstimate>;
  prepare(request: AssetGenerationRequest): Promise<PreparedRequest>;
  submit(request: PreparedRequest): Promise<GenerationJob>;
  poll(job: GenerationJob): Promise<GenerationStatus>;
  collect(job: GenerationJob): Promise<GeneratedAsset>;
}
