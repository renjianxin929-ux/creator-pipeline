import { isAbsolute, relative, resolve, sep } from "node:path";

import { transcriptDocumentSchema, type MediaRecord, type SilenceMap, type TranscriptDocument } from "../contracts/index.js";
import {
  appendProjectEvent,
  readProjectMediaRecords,
  readProjectState,
  resolveProjectDirectory,
  transitionProjectState,
  writeProjectTranscriptionArtifacts,
} from "../project/project-store.js";
import { deriveSilenceMap } from "./silence-map.js";
import type { TranscribeAdapter } from "./types.js";

export class TranscriptionWaitingError extends Error {
  override name = "TranscriptionWaitingError";
}

export class TranscribeProjectError extends Error {
  override name = "TranscribeProjectError";
}

export interface TranscribeProjectResult {
  adapter_id: string;
  media: MediaRecord;
  transcript: TranscriptDocument;
  silence_map: SilenceMap;
}

/**
 * Selects a primary audio-bearing capture without treating P1's cheap media
 * classification as transcript or semantic evidence.
 */
export function selectPrimaryMedia(records: readonly MediaRecord[]): MediaRecord | undefined {
  return (
    records.find(
      (record) => (record.kind === "camera" || record.kind === "screen") && record.has_audio === true,
    ) ?? records.find((record) => record.kind === "camera" || record.kind === "screen" || record.kind === "audio")
  );
}

export async function transcribeProject(
  slug: string,
  adapter: TranscribeAdapter | undefined,
  unavailableReason: string | undefined,
  cwd = process.cwd(),
): Promise<TranscribeProjectResult> {
  const currentState = readProjectState(slug, cwd);
  if (currentState.status !== "INGESTED" && currentState.status !== "TRANSCRIBED") {
    throw new TranscribeProjectError(
      `Project ${slug} must be INGESTED or TRANSCRIBED before transcription; current state is ${currentState.status}`,
    );
  }

  const primaryMedia = selectPrimaryMedia(readProjectMediaRecords(slug, cwd));
  if (primaryMedia === undefined) {
    return waitForUserAction(
      slug,
      "No video or audio media is available for transcription. Ingest a recording with audio, then rerun creator transcribe.",
      cwd,
    );
  }

  if (adapter === undefined) {
    const detail = unavailableReason === undefined ? "local FunClip/FunASR is unavailable" : unavailableReason;
    return waitForUserAction(
      slug,
      `Transcription is waiting for local FunClip/FunASR. ${detail}. Install Python and FunClip/FunASR, install a local model, set CREATOR_FUNCLIP_MODEL to that model path, then rerun creator transcribe.`,
      cwd,
    );
  }

  try {
    const projectDirectory = resolveProjectDirectory(slug, cwd);
    const transcript = transcriptDocumentSchema.parse(
      await adapter.transcribe({
        source_media_id: primaryMedia.id,
        media_path: resolveMediaPath(projectDirectory, primaryMedia.path),
      }),
    );

    if (transcript.source_media_id !== primaryMedia.id) {
      throw new TranscribeProjectError("Transcribe adapter returned a transcript for the wrong source media");
    }

    const silenceMap = deriveSilenceMap(transcript);
    writeProjectTranscriptionArtifacts(slug, transcript, silenceMap, cwd);
    transitionProjectState(slug, "TRANSCRIBED", cwd);
    appendProjectEvent(
      slug,
      {
        ts: new Date().toISOString(),
        stage: "transcribe",
        event: "transcribe_succeeded",
        project: slug,
        provider: adapter.id,
      },
      cwd,
    );

    return {
      adapter_id: adapter.id,
      media: primaryMedia,
      transcript,
      silence_map: silenceMap,
    };
  } catch (error) {
    appendProjectEvent(
      slug,
      {
        ts: new Date().toISOString(),
        stage: "transcribe",
        event: "transcribe_failed",
        project: slug,
        provider: adapter.id,
      },
      cwd,
    );

    if (currentState.status === "INGESTED") {
      transitionProjectState(slug, "FAILED", cwd);
    }

    throw error;
  }
}

function waitForUserAction(
  slug: string,
  message: string,
  cwd: string,
): never {
  appendProjectEvent(
    slug,
    {
      ts: new Date().toISOString(),
      stage: "transcribe",
      event: "waiting_user_action",
      project: slug,
    },
    cwd,
  );
  throw new TranscriptionWaitingError(message);
}

function resolveMediaPath(projectDirectory: string, relativeMediaPath: string): string {
  const mediaPath = resolve(projectDirectory, relativeMediaPath);
  const relativePath = relative(projectDirectory, mediaPath);

  if (relativePath === "" || relativePath.startsWith(`..${sep}`) || relativePath === ".." || isAbsolute(relativePath)) {
    throw new TranscribeProjectError("Primary media path must stay inside the project directory");
  }

  return mediaPath;
}
