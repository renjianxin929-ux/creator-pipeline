import { platformIdValues, type PlatformId } from "../contracts/publish.js";

export interface PublisherCapability {
  platform: PlatformId;
  official_api_available: boolean;
  account_permission_available: boolean;
  supports_upload: boolean;
  supports_draft: boolean;
  supports_schedule: boolean;
  supports_public_publish: boolean;
  fallback: readonly ["local_browser", "manual"];
}

/**
 * This records Creator Pipeline's P7 adapter availability, not a claim about
 * any external platform's current APIs. No platform capability is enabled
 * until a later, separately authorized implementation verifies it.
 */
export const publisherCapabilityMatrix: readonly PublisherCapability[] = platformIdValues.map((platform) => ({
  platform,
  official_api_available: false,
  account_permission_available: false,
  supports_upload: false,
  supports_draft: false,
  supports_schedule: false,
  supports_public_publish: false,
  fallback: ["local_browser", "manual"],
}));
