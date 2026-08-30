import { AssistedDropFolderProvider } from "./assisted-provider.js";

/** Omni is a draft/reference path. Collected media remains non-final by default. */
export class OmniUiProvider extends AssistedDropFolderProvider {
  constructor() {
    super({
      id: "omni_ui",
      automation: "assisted",
      has_watermark_risk: true,
      subscription_quota_used: false,
    });
  }
}
