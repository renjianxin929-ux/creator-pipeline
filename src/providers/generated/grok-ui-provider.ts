import { AssistedDropFolderProvider } from "./assisted-provider.js";

/**
 * Grok UI is an assisted web/app subscription path. It is intentionally not
 * an xAI API client and never reads an API key, cookie, or browser profile.
 */
export class GrokUiProvider extends AssistedDropFolderProvider {
  constructor() {
    super({
      id: "grok_ui",
      automation: "assisted",
      has_watermark_risk: false,
      subscription_quota_used: true,
    });
  }
}
