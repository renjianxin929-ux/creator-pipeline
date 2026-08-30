import type { TranscriptDocument } from "../contracts/index.js";

/** Facts an adapter needs to transcribe one already-ingested media record. */
export interface TranscribeInput {
  source_media_id: string;
  media_path: string;
  language?: string;
}

/**
 * The project orchestrator owns state and artifacts. Adapters only return the
 * normalized transcript contract, never vendor files or state updates.
 */
export interface TranscribeAdapter {
  readonly id: string;
  available(): boolean;
  transcribe(input: TranscribeInput): Promise<TranscriptDocument>;
}
