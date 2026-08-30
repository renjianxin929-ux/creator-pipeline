import { AssistedDropFolderProvider } from "./assisted-provider.js";

/** A no-credential provider for assets supplied directly by the Founder. */
export class ManualProvider extends AssistedDropFolderProvider {
  constructor() {
    super({
      id: "manual",
      automation: "manual",
      has_watermark_risk: false,
      subscription_quota_used: false,
    });
  }
}
