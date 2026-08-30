import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

import { mediaIdFromSha256, mediaRecordSchema, type MediaRecord } from "../contracts/index.js";
import {
  appendProjectEvent,
  appendProjectMediaRecord,
  readProjectMediaRecords,
  resolveProjectDirectory,
  transitionProjectState,
} from "../project/project-store.js";
import { classifyMedia } from "./classify.js";
import { probeMedia } from "./ffprobe.js";

export interface IngestFailure {
  input_path: string;
  message: string;
}

export interface IngestResult {
  ingested: readonly MediaRecord[];
  duplicate_skipped: readonly MediaRecord[];
  failures: readonly IngestFailure[];
}

export async function ingestMedia(
  slug: string,
  inputPaths: readonly string[],
  cwd = process.cwd(),
): Promise<IngestResult> {
  const projectDirectory = resolveProjectDirectory(slug, cwd);
  const existingRecords = readProjectMediaRecords(slug, cwd);
  const ingested: MediaRecord[] = [];
  const duplicateSkipped: MediaRecord[] = [];
  const failures: IngestFailure[] = [];

  for (const inputPath of inputPaths) {
    try {
      const source = await inspectSource(inputPath, cwd);
      const existing = existingRecords.find((record) => record.sha256 === source.sha256);

      if (existing !== undefined) {
        appendProjectEvent(slug, {
          ts: new Date().toISOString(),
          stage: "ingest",
          event: "ingest_duplicate_skipped",
          project: slug,
        }, cwd);
        duplicateSkipped.push(existing);
        continue;
      }

      const media = await ingestOne(projectDirectory, source);
      appendProjectMediaRecord(slug, media, cwd);
      appendProjectEvent(slug, {
        ts: new Date().toISOString(),
        stage: "ingest",
        event: "ingest_succeeded",
        project: slug,
      }, cwd);
      ingested.push(media);
      existingRecords.push(media);
    } catch (error) {
      failures.push({
        input_path: inputPath,
        message: error instanceof Error ? error.message : "Unable to ingest media",
      });
    }
  }

  if (ingested.length > 0 || duplicateSkipped.length > 0) {
    transitionProjectState(slug, "INGESTED", cwd);
  }

  return { ingested, duplicate_skipped: duplicateSkipped, failures };
}

interface IngestSource {
  source_path: string;
  byte_size: number;
  sha256: string;
}

async function inspectSource(inputPath: string, cwd: string): Promise<IngestSource> {
  const sourcePath = resolve(cwd, inputPath);
  const sourceStat = await stat(sourcePath);

  if (!sourceStat.isFile()) {
    throw new Error(`Input is not a file: ${inputPath}`);
  }

  return {
    source_path: sourcePath,
    byte_size: sourceStat.size,
    sha256: await sha256ForFile(sourcePath),
  };
}

async function ingestOne(projectDirectory: string, source: IngestSource): Promise<MediaRecord> {
  const probe = probeMedia(source.source_path);
  const kind = classifyMedia(source.source_path, probe);
  const storedName = `sha256-${source.sha256}${safeExtension(source.source_path)}`;
  const targetPath = join(projectDirectory, "raw", kind, storedName);

  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(source.source_path, targetPath);

  return mediaRecordSchema.parse({
    id: mediaIdFromSha256(source.sha256),
    sha256: source.sha256,
    byte_size: source.byte_size,
    path: toPortableRelativePath(projectDirectory, targetPath),
    kind,
    ...probe,
  });
}

function sha256ForFile(path: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);

    stream.on("error", rejectHash);
    stream.on("data", (chunk: string | Buffer) => {
      hash.update(chunk);
    });
    stream.on("end", () => {
      resolveHash(hash.digest("hex"));
    });
  });
}

function safeExtension(sourcePath: string): string {
  const extension = extname(sourcePath).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : ".bin";
}

function toPortableRelativePath(projectDirectory: string, targetPath: string): string {
  return relative(projectDirectory, targetPath).split(sep).join("/");
}
