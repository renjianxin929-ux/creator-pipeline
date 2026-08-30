import { extname } from "node:path";

import type { MediaKind } from "../contracts/index.js";
import type { MediaProbe } from "./ffprobe.js";

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"]);
const audioExtensions = new Set([".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg"]);
const screenVideoExtensions = new Set([".mkv", ".webm"]);

/**
 * This is deliberately a cheap intake guess. It never contributes to media
 * identity and a later project-level override may replace it.
 */
export function classifyMedia(sourcePath: string, probe: MediaProbe): MediaKind {
  const extension = extname(sourcePath).toLowerCase();

  if (imageExtensions.has(extension)) {
    return "image";
  }

  if (audioExtensions.has(extension) || (probe.has_audio === true && probe.width === undefined)) {
    return "audio";
  }

  if (probe.width !== undefined && probe.height !== undefined) {
    if (screenVideoExtensions.has(extension) || probe.orientation === "landscape") {
      return "screen";
    }

    return "camera";
  }

  return "misc";
}
