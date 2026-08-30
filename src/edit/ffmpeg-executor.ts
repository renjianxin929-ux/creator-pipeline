import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  parseEditPlan,
  type AssetManifest,
  type EditPlan,
  type EditPlanClip,
  type EditPlanFormat,
  type MediaRecord,
} from "../contracts/index.js";

export class FfmpegEditPlanError extends Error {
  override name = "FfmpegEditPlanError";
}

export interface FfmpegOutputDimensions {
  width: number;
  height: number;
}

export interface ExecuteFfmpegEditPlanOptions {
  output_relative_path?: string;
  output_dimensions?: FfmpegOutputDimensions;
  ffmpeg_command?: string;
  ffprobe_command?: string;
}

export interface FfmpegEditPlanExecution {
  output_path: string;
  output_relative_path: string;
  clip_count: number;
  duration_ms: number;
}

export interface FfmpegEditPlanInput {
  project_directory: string;
  plan: EditPlan;
  media_records: readonly MediaRecord[];
  asset_manifest: AssetManifest;
}

interface ResolvedClip {
  clip: EditPlanClip;
  source_path: string;
  has_audio: boolean;
}

/**
 * Executes the single edit-plan timeline with FFmpeg. It produces only the
 * normalized rough cut; captions, logo, and other visual treatment belong to
 * the later Remotion composition.
 */
export function executeFfmpegEditPlan(
  input: FfmpegEditPlanInput,
  options: ExecuteFfmpegEditPlanOptions = {},
): FfmpegEditPlanExecution {
  const plan = parseEditPlan(input.plan);
  const projectDirectory = resolve(input.project_directory);
  const ffmpegCommand = options.ffmpeg_command ?? "ffmpeg";
  const ffprobeCommand = options.ffprobe_command ?? "ffprobe";
  const outputRelativePath = options.output_relative_path ?? "render/rough-cut.mp4";

  assertCommandAvailable(ffmpegCommand, "FFmpeg");
  assertCommandAvailable(ffprobeCommand, "ffprobe");

  const resolvedClips = plan.timeline.map((clip) =>
    resolveClipSource(clip, input.media_records, input.asset_manifest, projectDirectory, ffprobeCommand),
  );
  const dimensions = normalizeOutputDimensions(plan.format, options.output_dimensions);
  const outputPath = resolveProjectFile(projectDirectory, outputRelativePath, "output path", false);
  const outputDirectory = dirname(outputPath);
  const temporaryDirectory = join(outputDirectory, `.rough-cut-${randomUUID()}`);
  const temporaryOutputPath = join(temporaryDirectory, "rough-cut.mp4");

  mkdirSync(temporaryDirectory, { recursive: true });

  try {
    const segmentPaths = resolvedClips.map((resolvedClip, index) => {
      const segmentPath = join(temporaryDirectory, `segment-${String(index).padStart(3, "0")}.mp4`);
      renderNormalizedSegment(
        resolvedClip,
        segmentPath,
        dimensions,
        ffmpegCommand,
      );
      return segmentPath;
    });

    const concatListPath = join(temporaryDirectory, "concat.txt");
    writeFileSync(concatListPath, segmentPaths.map(toConcatFileEntry).join("\n"), "utf8");
    runCommand(
      ffmpegCommand,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatListPath,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        temporaryOutputPath,
      ],
      "concat edit-plan segments",
    );

    if (!existsSync(temporaryOutputPath) || statSync(temporaryOutputPath).size === 0) {
      throw new FfmpegEditPlanError("FFmpeg completed without producing a rough-cut file");
    }

    replaceFileAtomically(temporaryOutputPath, outputPath);

    return {
      output_path: outputPath,
      output_relative_path: toPortableRelativePath(projectDirectory, outputPath),
      clip_count: resolvedClips.length,
      duration_ms: plan.timeline.reduce(
        (total, clip) => total + clip.source_end_ms - clip.source_start_ms,
        0,
      ),
    };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export function isFfmpegAvailable(command = "ffmpeg"): boolean {
  return commandIsAvailable(command);
}

export function isFfprobeAvailable(command = "ffprobe"): boolean {
  return commandIsAvailable(command);
}

function resolveClipSource(
  clip: EditPlanClip,
  mediaRecords: readonly MediaRecord[],
  assetManifest: AssetManifest,
  projectDirectory: string,
  ffprobeCommand: string,
): ResolvedClip {
  if (clip.source_asset_id !== undefined) {
    const asset = assetManifest.assets.find((candidate) => candidate.asset_id === clip.source_asset_id);
    if (asset === undefined) {
      throw new FfmpegEditPlanError(`Edit-plan source asset does not exist: ${clip.source_asset_id}`);
    }
    if (!asset.final_eligible) {
      throw new FfmpegEditPlanError(
        `Edit-plan source asset is not final eligible: ${clip.source_asset_id}`,
      );
    }

    const sourcePath = resolveProjectFile(projectDirectory, asset.path, "asset source", true);
    return { clip, source_path: sourcePath, has_audio: probeHasAudio(sourcePath, ffprobeCommand) };
  }

  const source = clip.source;
  if (source === undefined) {
    throw new FfmpegEditPlanError(`Edit-plan clip ${clip.id} has no source`);
  }

  const media = mediaRecords.find((record) => record.id === source || record.path === source);
  const sourcePath = resolveProjectFile(projectDirectory, media?.path ?? source, "clip source", true);
  return {
    clip,
    source_path: sourcePath,
    has_audio: media?.has_audio ?? probeHasAudio(sourcePath, ffprobeCommand),
  };
}

function normalizeOutputDimensions(
  format: EditPlanFormat,
  suppliedDimensions: FfmpegOutputDimensions | undefined,
): FfmpegOutputDimensions {
  const dimensions = suppliedDimensions ?? defaultDimensionsForFormat(format);
  if (
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width % 2 !== 0 ||
    dimensions.height % 2 !== 0
  ) {
    throw new FfmpegEditPlanError("FFmpeg output dimensions must be positive, even integers");
  }

  return dimensions;
}

function defaultDimensionsForFormat(format: EditPlanFormat): FfmpegOutputDimensions {
  switch (format) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "16:9":
      return { width: 1920, height: 1080 };
    case "1:1":
      return { width: 1080, height: 1080 };
  }
}

function renderNormalizedSegment(
  resolvedClip: ResolvedClip,
  outputPath: string,
  dimensions: FfmpegOutputDimensions,
  ffmpegCommand: string,
): void {
  const durationSeconds = toFfmpegSeconds(
    resolvedClip.clip.source_end_ms - resolvedClip.clip.source_start_ms,
  );
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    resolvedClip.source_path,
    "-ss",
    toFfmpegSeconds(resolvedClip.clip.source_start_ms),
    "-t",
    durationSeconds,
  ];

  if (resolvedClip.has_audio) {
    args.push("-map", "0:v:0", "-map", "0:a:0");
  } else {
    args.push(
      "-f",
      "lavfi",
      "-t",
      durationSeconds,
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
    );
  }

  args.push(
    "-vf",
    createVideoFilter(dimensions),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  );

  runCommand(ffmpegCommand, args, `cut clip ${resolvedClip.clip.id}`);
}

function createVideoFilter(dimensions: FfmpegOutputDimensions): string {
  return [
    `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease`,
    `pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    "setsar=1",
    "fps=30",
  ].join(",");
}

function probeHasAudio(sourcePath: string, ffprobeCommand: string): boolean {
  const result = spawnSync(
    ffprobeCommand,
    [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=index",
      "-of",
      "csv=p=0",
      sourcePath,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  if (result.error !== undefined || result.status !== 0) {
    const detail = result.stderr.trim();
    throw new FfmpegEditPlanError(
      `ffprobe could not inspect audio for ${sourcePath}${detail === "" ? "" : `: ${detail}`}`,
    );
  }

  return result.stdout.trim() !== "";
}

function resolveProjectFile(
  projectDirectory: string,
  relativePath: string,
  label: string,
  requireExisting: boolean,
): string {
  const resolvedPath = resolve(projectDirectory, relativePath);
  const relativePathFromProject = relative(projectDirectory, resolvedPath);

  if (
    relativePathFromProject === "" ||
    relativePathFromProject === ".." ||
    relativePathFromProject.startsWith(`..${sep}`) ||
    isAbsolute(relativePathFromProject)
  ) {
    throw new FfmpegEditPlanError(`${label} must stay inside the project directory`);
  }

  if (requireExisting && (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile())) {
    throw new FfmpegEditPlanError(`${label} does not exist: ${relativePath}`);
  }

  return resolvedPath;
}

function assertCommandAvailable(command: string, label: string): void {
  if (!commandIsAvailable(command)) {
    throw new FfmpegEditPlanError(`${label} is unavailable. Install it locally, then rerun the render.`);
  }
}

function commandIsAvailable(command: string): boolean {
  const result = spawnSync(command, ["-version"], { stdio: "ignore", windowsHide: true });
  return result.error === undefined && result.status === 0;
}

function runCommand(command: string, args: readonly string[], action: string): void {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  if (result.error !== undefined || result.status !== 0) {
    const detail = result.stderr.trim();
    throw new FfmpegEditPlanError(
      `FFmpeg failed to ${action}${detail === "" ? "" : `: ${detail}`}`,
    );
  }
}

function replaceFileAtomically(sourcePath: string, outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  const backupPath = existsSync(outputPath) ? `${outputPath}.backup-${randomUUID()}` : undefined;

  if (backupPath !== undefined) {
    renameSync(outputPath, backupPath);
  }

  try {
    renameSync(sourcePath, outputPath);
  } catch (error) {
    if (backupPath !== undefined && existsSync(backupPath)) {
      renameSync(backupPath, outputPath);
    }
    throw error;
  }

  if (backupPath !== undefined) {
    rmSync(backupPath, { force: true });
  }
}

function toFfmpegSeconds(milliseconds: number): string {
  return (milliseconds / 1_000).toFixed(3);
}

function toConcatFileEntry(path: string): string {
  const portablePath = path.split(sep).join("/").replaceAll("'", "'\\\\''");
  return `file '${portablePath}'`;
}

function toPortableRelativePath(projectDirectory: string, absolutePath: string): string {
  return relative(projectDirectory, absolutePath).split(sep).join("/");
}
