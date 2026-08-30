import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { transcriptDocumentSchema, type TranscriptDocument, type TranscriptSegment } from "../contracts/index.js";
import type { TranscribeAdapter, TranscribeInput } from "./types.js";

const resultMarker = "__CREATOR_FUNCLIP_RESULT__";

/*
 * This program is deliberately passed to Python only when a caller has both a
 * local model and the FunASR package. A local model path is required so this
 * adapter never turns a normal CLI or CI run into a ModelScope download.
 */
const funAsrProgram = `
import json
import sys
from funasr import AutoModel

request = json.load(sys.stdin)
model = AutoModel(model=request["model_path"])
result = model.generate(input=request["media_path"])
print("${resultMarker}" + json.dumps(result, ensure_ascii=False))
`;

export interface FunClipTranscribeAdapterOptions {
  python_command?: string;
  model_path?: string;
}

export class FunClipAdapterUnavailableError extends Error {
  override name = "FunClipAdapterUnavailableError";
}

/**
 * Thin subprocess adapter for a locally installed FunClip/FunASR setup.
 * It maps the subprocess result into Creator Pipeline's contract in memory;
 * native FunClip JSON is never exposed as a persisted project artifact.
 */
export class FunClipTranscribeAdapter implements TranscribeAdapter {
  readonly id = "funclip";
  private readonly pythonCommand: string;
  private readonly modelPath: string | undefined;
  private lastUnavailableReason = "FunClip availability has not been checked";

  constructor(options: FunClipTranscribeAdapterOptions = {}) {
    this.pythonCommand = options.python_command ?? process.env.CREATOR_FUNCLIP_PYTHON ?? "python";
    this.modelPath = options.model_path ?? process.env.CREATOR_FUNCLIP_MODEL;
  }

  available(): boolean {
    const modelPath = this.localModelPath();
    if (modelPath === undefined) {
      return false;
    }

    const result = spawnSync(this.pythonCommand, ["-c", "import funasr"], {
      encoding: "utf8",
      windowsHide: true,
    });

    if (result.error !== undefined) {
      this.lastUnavailableReason = `Python command \"${this.pythonCommand}\" is unavailable`;
      return false;
    }

    if (result.status !== 0) {
      this.lastUnavailableReason = "Python cannot import the funasr package";
      return false;
    }

    this.lastUnavailableReason = "";
    return true;
  }

  unavailableReason(): string {
    this.available();
    return this.lastUnavailableReason;
  }

  async transcribe(input: TranscribeInput): Promise<TranscriptDocument> {
    const modelPath = this.localModelPath();
    if (modelPath === undefined || !this.available()) {
      throw new FunClipAdapterUnavailableError(this.lastUnavailableReason);
    }

    const result = spawnSync(this.pythonCommand, ["-c", funAsrProgram], {
      encoding: "utf8",
      input: JSON.stringify({ media_path: input.media_path, model_path: modelPath }),
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });

    if (result.error !== undefined) {
      throw new Error("FunClip could not start its local Python process");
    }

    if (result.status !== 0) {
      throw new Error("FunClip transcription failed; check the local model and Python installation");
    }

    return mapFunClipOutput(readMarkedResult(result.stdout), input);
  }

  private localModelPath(): string | undefined {
    if (this.modelPath === undefined || this.modelPath.trim().length === 0) {
      this.lastUnavailableReason = "No local FunClip/FunASR model is configured (set CREATOR_FUNCLIP_MODEL)";
      return undefined;
    }

    const resolvedPath = resolve(this.modelPath);
    if (!existsSync(resolvedPath)) {
      this.lastUnavailableReason = "The configured CREATOR_FUNCLIP_MODEL path does not exist";
      return undefined;
    }

    return resolvedPath;
  }
}

/** Maps known FunASR result shapes to the internal transcript contract. */
export function mapFunClipOutput(rawOutput: unknown, input: TranscribeInput): TranscriptDocument {
  const segments = collectVendorSegments(rawOutput)
    .map((segment, index) => toTranscriptSegment(segment, index))
    .sort((left, right) => left.start_ms - right.start_ms || left.end_ms - right.end_ms || left.id.localeCompare(right.id))
    .map((segment, index) => ({ ...segment, id: `seg_${String(index + 1).padStart(3, "0")}` }));

  if (segments.length === 0) {
    throw new Error("FunClip returned no timestamped transcript segments");
  }

  return transcriptDocumentSchema.parse({
    source_media_id: input.source_media_id,
    ...(input.language === undefined ? {} : { language: input.language }),
    segments,
  });
}

function readMarkedResult(stdout: string): unknown {
  const line = stdout
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(resultMarker));
  if (line === undefined) {
    throw new Error("FunClip returned no readable transcript result");
  }

  try {
    return JSON.parse(line.slice(resultMarker.length));
  } catch {
    throw new Error("FunClip returned an invalid transcript result");
  }
}

function collectVendorSegments(rawOutput: unknown): unknown[] {
  const roots = Array.isArray(rawOutput) ? rawOutput : [rawOutput];
  const segments: unknown[] = [];

  for (const root of roots) {
    const record = asRecord(root);
    if (record === undefined) {
      continue;
    }

    const nested = [record.sentence_info, record.sentences, record.segments, record.results, record.result]
      .filter(Array.isArray)
      .flatMap((value) => value);
    if (nested.length > 0) {
      segments.push(...nested);
      continue;
    }

    segments.push(record);
  }

  return segments;
}

function toTranscriptSegment(value: unknown, index: number): TranscriptSegment {
  const record = asRecord(value);
  if (record === undefined) {
    throw new Error("FunClip returned an invalid transcript segment");
  }

  const timeRange = readTimeRange(record);
  const text = firstText(record, ["text", "sentence", "content"]);
  if (timeRange === undefined || text === undefined) {
    throw new Error("FunClip returned a segment without text or timestamps");
  }

  const speaker = firstText(record, ["speaker", "spk", "speaker_id"]) ?? "spk_0";
  const confidence = optionalConfidence(record.confidence ?? record.score);

  return {
    id: `seg_${String(index + 1).padStart(3, "0")}`,
    start_ms: timeRange.start_ms,
    end_ms: timeRange.end_ms,
    speaker,
    text,
    ...(confidence === undefined ? {} : { confidence }),
  };
}

function readTimeRange(record: Record<string, unknown>): { start_ms: number; end_ms: number } | undefined {
  const directStart = numberValue(record.start_ms ?? record.start ?? record.begin_ms ?? record.begin);
  const directEnd = numberValue(record.end_ms ?? record.end ?? record.finish_ms ?? record.finish);
  if (directStart !== undefined && directEnd !== undefined) {
    return { start_ms: directStart, end_ms: directEnd };
  }

  if (!Array.isArray(record.timestamp) || record.timestamp.length === 0) {
    return undefined;
  }

  const first = record.timestamp[0];
  const last = record.timestamp[record.timestamp.length - 1];
  const start = Array.isArray(first) ? numberValue(first[0]) : numberValue(first);
  const end = Array.isArray(last) ? numberValue(last[last.length - 1]) : numberValue(last);

  return start === undefined || end === undefined ? undefined : { start_ms: start, end_ms: end };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstText(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(number) && number >= 0 ? number : undefined;
}

function optionalConfidence(value: unknown): number | undefined {
  const confidence = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : undefined;
}
