import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type EditPlan,
  type TranscriptSegment,
} from "../contracts/index.js";
import {
  executeFfmpegEditPlan,
  FfmpegEditPlanError,
  isFfmpegAvailable,
  isFfprobeAvailable,
  type ExecuteFfmpegEditPlanOptions,
} from "../edit/ffmpeg-executor.js";
import {
  appendProjectEvent,
  readProjectAssetManifest,
  readProjectEditPlan,
  readProjectMediaRecords,
  readProjectState,
  readProjectTranscript,
  resolveProjectDirectory,
  transitionProjectState,
} from "../project/project-store.js";
import {
  CREATOR_PREVIEW_COMPOSITION_ID,
} from "../remotion/root.js";
import type { CreatorPreviewProps, PreviewCaption } from "../remotion/preview-composition.js";
import { resolveProjectBrand } from "../brand/project-brand.js";

export class PreviewRenderError extends Error {
  override name = "PreviewRenderError";
}

export class PreviewRenderWaitingError extends PreviewRenderError {
  override name = "PreviewRenderWaitingError";
}

export interface RenderProjectPreviewOptions {
  ffmpeg?: ExecuteFfmpegEditPlanOptions;
  render_scale?: number;
}

export interface PreviewRenderResult {
  preview_path: string;
  rough_cut_path: string;
  caption_count: number;
}

/**
 * Renders P5's only preview target. The FFmpeg rough cut and the Remotion
 * visual layer receive the same edit-plan object; no renderer-owned timeline
 * is persisted or synthesized.
 */
export async function renderProjectPreview(
  slug: string,
  cwd = process.cwd(),
  options: RenderProjectPreviewOptions = {},
): Promise<PreviewRenderResult> {
  const currentState = readProjectState(slug, cwd);
  if (currentState.status !== "EDIT_PLAN_READY" && currentState.status !== "PREVIEW_READY") {
    throw new PreviewRenderError(
      `Project ${slug} must be EDIT_PLAN_READY before preview rendering; current state is ${currentState.status}`,
    );
  }

  const plan = readProjectEditPlan(slug, cwd);
  if (plan === undefined) {
    return waitForPlan(slug, currentState.status, cwd);
  }
  if (plan.format !== "9:16") {
    throw new PreviewRenderError("P5 preview rendering currently supports only 9:16 edit plans");
  }

  const transcript = readProjectTranscript(slug, cwd);
  if (transcript === undefined) {
    return waitForPlan(slug, currentState.status, cwd, "Preview rendering is waiting for the normalized transcript.");
  }

  const projectDirectory = resolveProjectDirectory(slug, cwd);
  const renderDirectory = join(projectDirectory, "render");
  const previewPath = join(renderDirectory, "preview.mp4");
  const temporaryDirectory = join(renderDirectory, `.preview-${randomUUID()}`);
  const temporaryPublicDirectory = join(temporaryDirectory, "public");
  const temporaryBundleDirectory = join(temporaryDirectory, "bundle");
  const temporaryPreviewPath = join(temporaryDirectory, "preview.mp4");

  try {
    const browserExecutable = resolveLocalBrowserExecutable();
    if (browserExecutable === undefined) {
      throw new PreviewRenderWaitingError(
        "A local Chrome or Chromium executable is required for Remotion preview rendering.",
      );
    }
    const roughCut = executeFfmpegEditPlan(
      {
        project_directory: projectDirectory,
        plan,
        media_records: readProjectMediaRecords(slug, cwd),
        asset_manifest: readProjectAssetManifest(slug, cwd),
      },
      options.ffmpeg,
    );
    const previewProps: CreatorPreviewProps = {
      cut_video_src: "rough-cut.mp4",
      edit_plan: plan,
      captions: mapTranscriptToPreviewCaptions(plan, transcript.segments),
      brand: resolveProjectBrand(slug, cwd).brand,
    };

    mkdirSync(temporaryPublicDirectory, { recursive: true });
    copyFileSync(roughCut.output_path, join(temporaryPublicDirectory, previewProps.cut_video_src));

    const serveUrl = await bundle({
      entryPoint: resolveRemotionEntryPoint(),
      rootDir: resolveRepositoryRoot(),
      publicDir: temporaryPublicDirectory,
      outDir: temporaryBundleDirectory,
    });
    const composition = await selectComposition({
      serveUrl,
      id: CREATOR_PREVIEW_COMPOSITION_ID,
      inputProps: previewProps,
      logLevel: "error",
      browserExecutable,
    });
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: temporaryPreviewPath,
      inputProps: previewProps,
      logLevel: "error",
      concurrency: 1,
      scale: options.render_scale,
      browserExecutable,
    });

    if (!existsSync(temporaryPreviewPath) || statSync(temporaryPreviewPath).size === 0) {
      throw new PreviewRenderError("Remotion completed without producing preview.mp4");
    }

    replaceFileAtomically(temporaryPreviewPath, previewPath);
    if (currentState.status !== "PREVIEW_READY") {
      transitionProjectState(slug, "PREVIEW_READY", cwd);
    }
    appendProjectEvent(
      slug,
      {
        ts: new Date().toISOString(),
        stage: "preview",
        event: "preview_ready",
        project: slug,
      },
      cwd,
    );

    return {
      preview_path: previewPath,
      rough_cut_path: roughCut.output_path,
      caption_count: previewProps.captions.length,
    };
  } catch (error) {
    appendProjectEvent(
      slug,
      {
        ts: new Date().toISOString(),
        stage: "preview",
        event: "preview_failed",
        project: slug,
      },
      cwd,
    );

    if (error instanceof FfmpegEditPlanError) {
      throw new PreviewRenderWaitingError(error.message);
    }
    if (error instanceof PreviewRenderError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "Unable to render preview";
    throw new PreviewRenderError(message);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

/** Returns overlay timestamps in rough-cut output time, derived from the plan. */
export function mapTranscriptToPreviewCaptions(
  plan: EditPlan,
  segments: readonly TranscriptSegment[],
): PreviewCaption[] {
  const captions: PreviewCaption[] = [];
  let outputOffsetMs = 0;

  for (const clip of plan.timeline) {
    const durationMs = clip.source_end_ms - clip.source_start_ms;
    if (clip.caption && clip.source !== undefined) {
      for (const segment of segments) {
        const overlapStartMs = Math.max(segment.start_ms, clip.source_start_ms);
        const overlapEndMs = Math.min(segment.end_ms, clip.source_end_ms);
        if (overlapEndMs <= overlapStartMs) {
          continue;
        }

        captions.push({
          id: `${clip.id}:${segment.id}`,
          start_ms: outputOffsetMs + overlapStartMs - clip.source_start_ms,
          end_ms: outputOffsetMs + overlapEndMs - clip.source_start_ms,
          text: segment.text,
        });
      }
    }
    outputOffsetMs += durationMs;
  }

  return captions;
}

export function isRemotionPreviewAvailable(): boolean {
  try {
    return (
      isFfmpegAvailable() &&
      isFfprobeAvailable() &&
      resolveLocalBrowserExecutable() !== undefined &&
      existsSync(resolveRemotionEntryPoint())
    );
  } catch {
    return false;
  }
}

/** Uses a fresh headless process only; no browser profile or session is read. */
export function resolveLocalBrowserExecutable(): string | undefined {
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          ]
        : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

  return candidates.find((candidate) => existsSync(candidate));
}

function waitForPlan(
  slug: string,
  currentStatus: "EDIT_PLAN_READY" | "PREVIEW_READY",
  cwd: string,
  message = "Preview rendering is waiting for plans/edit-plan.json. Run creator edit plan, then rerun creator render preview.",
): never {
  appendProjectEvent(
    slug,
    {
      ts: new Date().toISOString(),
      stage: "preview",
      event: "waiting_user_action",
      project: slug,
    },
    cwd,
  );
  if (currentStatus !== "PREVIEW_READY") {
    transitionProjectState(slug, "WAITING_USER_ACTION", cwd);
  }
  throw new PreviewRenderWaitingError(message);
}

function resolveRemotionEntryPoint(): string {
  const compiledEntry = join(resolveRepositoryRoot(), "dist", "remotion", "entry.js");
  if (existsSync(compiledEntry)) {
    return compiledEntry;
  }

  const sourceEntry = fileURLToPath(new URL("../remotion/entry.tsx", import.meta.url));
  if (existsSync(sourceEntry)) {
    return sourceEntry;
  }

  throw new PreviewRenderError("Remotion preview composition entry point is unavailable");
}

function resolveRepositoryRoot(): string {
  return resolve(fileURLToPath(new URL("../../", import.meta.url)));
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
