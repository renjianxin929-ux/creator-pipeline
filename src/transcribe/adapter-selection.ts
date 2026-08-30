import { FakeTranscribeAdapter } from "./fake-adapter.js";
import { FunClipTranscribeAdapter } from "./funclip-adapter.js";
import type { TranscribeAdapter } from "./types.js";

export interface TranscribeAdapterSelection {
  adapter: TranscribeAdapter | undefined;
  unavailable_reason: string | undefined;
}

/**
 * Production always prefers an available local FunClip/FunASR installation.
 * The fake adapter is an explicit test-only fallback, never a silent default.
 */
export function selectDefaultTranscribeAdapter(): TranscribeAdapterSelection {
  const funclip = new FunClipTranscribeAdapter();
  if (funclip.available()) {
    return { adapter: funclip, unavailable_reason: undefined };
  }

  if (process.env.CREATOR_TRANSCRIBE_ADAPTER === "fake") {
    return { adapter: new FakeTranscribeAdapter(), unavailable_reason: undefined };
  }

  return {
    adapter: undefined,
    unavailable_reason: funclip.unavailableReason(),
  };
}
