import { spawnSync } from "node:child_process";

import type { MediaOrientation, MediaRecord } from "../contracts/index.js";

export type MediaProbe = Pick<
  MediaRecord,
  "duration_ms" | "fps" | "codec" | "width" | "height" | "has_audio" | "orientation"
>;

export class FfprobeError extends Error {
  override name = "FfprobeError";
}

/**
 * Runs ffprobe and returns only Creator Pipeline's normalized media facts.
 * The transient ffprobe JSON is intentionally never exposed or persisted.
 */
export function probeMedia(filePath: string): MediaProbe {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate:stream_tags=rotate",
      "-of",
      "json",
      filePath,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );

  if (result.error !== undefined) {
    if ("code" in result.error && result.error.code === "ENOENT") {
      throw new FfprobeError("ffprobe is required for ingest but was not found on PATH");
    }

    throw new FfprobeError(`ffprobe could not inspect media: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const detail = result.stderr.trim();
    throw new FfprobeError(
      detail.length > 0 ? `ffprobe failed to inspect media: ${detail}` : "ffprobe failed to inspect media",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new FfprobeError("ffprobe returned invalid JSON");
  }

  return normalizeFfprobePayload(payload);
}

function normalizeFfprobePayload(payload: unknown): MediaProbe {
  const root = asRecord(payload);
  if (root === undefined) {
    throw new FfprobeError("ffprobe returned an invalid payload");
  }

  const streams = Array.isArray(root.streams)
    ? root.streams.map(asRecord).filter((stream): stream is Record<string, unknown> => stream !== undefined)
    : [];
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  const format = asRecord(root.format);

  const width = positiveInteger(videoStream?.width);
  const height = positiveInteger(videoStream?.height);
  const rotation = rotationFrom(videoStream);
  const orientation = mediaOrientation(width, height, rotation);
  const durationMs = durationMilliseconds(format?.duration);
  const fps = frameRate(videoStream?.r_frame_rate);
  const codec = nonEmptyString(videoStream?.codec_name) ?? nonEmptyString(audioStream?.codec_name);

  return {
    ...(durationMs === undefined ? {} : { duration_ms: durationMs }),
    ...(fps === undefined ? {} : { fps }),
    ...(codec === undefined ? {} : { codec }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    has_audio: audioStream !== undefined,
    ...(orientation === undefined ? {} : { orientation }),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function durationMilliseconds(value: unknown): number | undefined {
  const seconds = typeof value === "number" ? value : Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1_000) : undefined;
}

function frameRate(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const [numerator, denominator] = value.split("/");
  const numeratorValue = Number(numerator);
  const denominatorValue = Number(denominator);
  const rate = denominatorValue === 0 ? Number.NaN : numeratorValue / denominatorValue;

  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

function rotationFrom(stream: Record<string, unknown> | undefined): number {
  const tags = asRecord(stream?.tags);
  const rotation = typeof tags?.rotate === "string" || typeof tags?.rotate === "number" ? Number(tags.rotate) : 0;
  return Number.isFinite(rotation) ? rotation : 0;
}

function mediaOrientation(
  width: number | undefined,
  height: number | undefined,
  rotation: number,
): MediaOrientation | undefined {
  if (width === undefined || height === undefined) {
    return undefined;
  }

  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const rotated = normalizedRotation === 90 || normalizedRotation === 270;
  const displayWidth = rotated ? height : width;
  const displayHeight = rotated ? width : height;

  if (displayWidth === displayHeight) {
    return "square";
  }

  return displayWidth > displayHeight ? "landscape" : "portrait";
}
