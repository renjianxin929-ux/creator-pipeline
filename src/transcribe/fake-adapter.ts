import { transcriptDocumentSchema, type TranscriptDocument } from "../contracts/index.js";
import type { TranscribeAdapter, TranscribeInput } from "./types.js";

/**
 * Test-only adapter. Its fixture is intentionally deterministic and does not
 * inspect media, invoke Python, contact a service, or require a model.
 */
export class FakeTranscribeAdapter implements TranscribeAdapter {
  readonly id = "fake";

  available(): boolean {
    return true;
  }

  async transcribe(input: TranscribeInput): Promise<TranscriptDocument> {
    return transcriptDocumentSchema.parse({
      source_media_id: input.source_media_id,
      ...(input.language === undefined ? { language: "zh" } : { language: input.language }),
      segments: [
        {
          id: "seg_001",
          start_ms: 0,
          end_ms: 800,
          speaker: "spk_0",
          text: "这是测试转写的第一句。",
          confidence: 0.99,
        },
        {
          id: "seg_002",
          start_ms: 1_200,
          end_ms: 1_850,
          speaker: "spk_0",
          text: "这是测试转写的第二句。",
          confidence: 0.98,
        },
        {
          id: "seg_003",
          start_ms: 4_000,
          end_ms: 4_700,
          speaker: "spk_0",
          text: "这是测试转写的第三句。",
          confidence: 0.97,
        },
      ],
    });
  }
}
