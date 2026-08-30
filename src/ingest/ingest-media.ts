import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

import { mediaIdFromSha256, mediaRecordSchema, type MediaRecord } from "../contracts/index.js";
import {
  appendProjectEvent,
  appendProjectMediaRecord,
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
  failures: readonly IngestFailure[];
}

export async function ingestMedia(
  slug: string,
  inputPaths: readonly string[],
  cwd = process.cwd(),
): Promise<IngestResult> {
  const projectDirectory = resolveProjectDirectory(slug, cwd);
  const ingested: MediaRecord[] = [];
  const failures: IngestFailure[] = [];

  for (const inputPath of inputPaths) {
    try {
      const media = await ingestOne(projectDirectory, inputPath, cwd);
      appendProjectMediaRecord(slug, media, cwd);
      appendProjectEvent(slug, {
        ts: new Date().toISOString(),
        stage: "ingest",
        event: "ingest_succeeded",
        project: slug,
      }, cwd);
      ingested.push(media);
    } catch (error) {
      failures.push({
        input_path: inputPath,
        message: error instanceof Error ? error.message : "Unable to ingest media",
      });
    }
  }

  if (ingested.length > 0) {
    transitionProjectState(slug, "INGESTED", cwd);
  }

  return { ingested, failures };
}

async function ingestOne(projectDirectory: string, inputPath: string, cwd: string): Promise<MediaRecord> {
  const sourcePath = resolve(cwd, inputPath);
  const sourceStat = await stat(sourcePath);

  if (!sourceStat.isFile()) {
    throw new Error(`Input is not a file: ${inputPath}`);
  }

  const sha256 = await sha256ForFile(sourcePath);
  const probe = probeMedia(sourcePath);
  const kind = classifyMedia(sourcePath, probe);
  const storedName = `sha256-${sha256}${safeExtension(sourcePath)}`;
  const targetPath = join(projectDirectory, "raw", kind, storedName);

  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);

  return mediaRecordSchema.parse({
    id: mediaIdFromSha256(sha256),
    sha256,
    byte_size: sourceStat.size,
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
