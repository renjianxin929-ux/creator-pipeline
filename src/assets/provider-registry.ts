import {
  GrokApiProvider,
  GrokUiProvider,
  ManualProvider,
  MiniMaxApiProvider,
  OmniUiProvider,
  type GeneratedAssetProvider,
} from "../providers/generated/index.js";

/** Registers all contract IDs while retaining a distinct Grok UI/API split. */
export function createDefaultGeneratedAssetProviders(): GeneratedAssetProvider[] {
  return [
    new GrokUiProvider(),
    new GrokApiProvider(),
    new MiniMaxApiProvider(),
    new OmniUiProvider(),
    new ManualProvider(),
  ];
}
