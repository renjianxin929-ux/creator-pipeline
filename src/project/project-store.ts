import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import { loadCurrentBrandKit } from "../brand/loader.js";
import {
  assetManifestSchema,
  assetPlanSchema,
  createDefaultProjectGenerationBudget,
  createInitialState,
  eventRecordSchema,
  mediaRecordListSchema,
  mediaRecordSchema,
  projectIdentitySchema,
  projectGenerationBudgetSchema,
  projectSlugSchema,
  projectStateSchema,
  renderSrt,
  silenceMapSchema,
  transcriptDocumentSchema,
  assertTransition,
  type EventRecord,
  type AssetManifest,
  type AssetPlan,
  type MediaRecord,
  type ProjectIdentity,
  type ProjectGenerationBudget,
  type ProjectState,
  type ProjectStateValue,
  type SilenceMap,
  type TranscriptDocument,
} from "../contracts/index.js";

const projectDirectoryNames = [
  "raw",
  "content",
  "derived",
  "assets",
  "plans",
  "review",
  "render",
  "publish",
] as const;

const creatorConfigSchema = z.object({
  workspace: z.string().min(1).optional(),
});

export class ProjectStoreError extends Error {
  override name = "ProjectStoreError";
}

export interface InitializedProject {
  directory: string;
  identity: ProjectIdentity;
  state: ProjectState;
}

export function resolveWorkspaceRoot(cwd = process.cwd()): string {
  const configPath = join(cwd, "creator.config.json");

  if (!existsSync(configPath)) {
    return resolve(cwd, "workspace");
  }

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    throw new ProjectStoreError(`Unable to read valid JSON from ${configPath}`);
  }

  const parsed = creatorConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new ProjectStoreError(`Invalid workspace configuration in ${configPath}`);
  }

  return resolve(cwd, parsed.data.workspace ?? "workspace");
}

export function initializeProject(slugInput: string, cwd = process.cwd()): InitializedProject {
  const slug = requireSlug(slugInput);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const projectsRoot = join(workspaceRoot, "projects");
  const projectDirectory = join(projectsRoot, slug);

  if (existsSync(projectDirectory)) {
    throw new ProjectStoreError(`Project already exists: ${slug}`);
  }

  const defaultBrandVersion = loadCurrentBrandKit(cwd).brand_version;

  mkdirSync(projectsRoot, { recursive: true });
  mkdirSync(projectDirectory);

  for (const directoryName of projectDirectoryNames) {
    mkdirSync(join(projectDirectory, directoryName));
  }

  const createdAt = new Date().toISOString();
  const identity = projectIdentitySchema.parse({
    id: randomUUID(),
    slug,
    created_at: createdAt,
    brand_version: defaultBrandVersion,
    budget: createDefaultProjectGenerationBudget(),
  });
  const state = createInitialState();
  const event = eventRecordSchema.parse({
    ts: createdAt,
    stage: "init",
    event: "project_created",
    project: slug,
  });

  writeJson(join(projectDirectory, "project.json"), identity);
  writeJson(join(projectDirectory, "state.json"), state);
  writeFileSync(join(projectDirectory, "events.ndjson"), `${JSON.stringify(event)}\n`, "utf8");

  return { directory: projectDirectory, identity, state };
}

export function readProjectIdentity(slugInput: string, cwd = process.cwd()): ProjectIdentity {
  const slug = requireSlug(slugInput);
  const projectPath = join(resolveProjectDirectory(slug, cwd), "project.json");

  if (!existsSync(projectPath)) {
    throw new ProjectStoreError(`Project identity does not exist: ${slug}`);
  }

  let rawProject: unknown;
  try {
    rawProject = JSON.parse(readFileSync(projectPath, "utf8"));
  } catch {
    throw new ProjectStoreError(`Unable to read valid project identity for: ${slug}`);
  }

  const parsed = projectIdentitySchema.safeParse(rawProject);
  if (!parsed.success) {
    throw new ProjectStoreError(`Invalid project identity for: ${slug}`);
  }

  return parsed.data;
}

export function readProjectState(slugInput: string, cwd = process.cwd()): ProjectState {
  const slug = requireSlug(slugInput);
  const statePath = join(resolveProjectDirectory(slug, cwd), "state.json");

  if (!existsSync(statePath)) {
    throw new ProjectStoreError(`Project state does not exist: ${slug}`);
  }

  let rawState: unknown;
  try {
    rawState = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    throw new ProjectStoreError(`Unable to read valid project state for: ${slug}`);
  }

  const parsed = projectStateSchema.safeParse(rawState);
  if (!parsed.success) {
    throw new ProjectStoreError(`Invalid project state for: ${slug}`);
  }

  return parsed.data;
}

export function resolveProjectDirectory(slugInput: string, cwd = process.cwd()): string {
  const slug = requireSlug(slugInput);
  const projectDirectory = join(resolveWorkspaceRoot(cwd), "projects", slug);

  if (!existsSync(projectDirectory)) {
    throw new ProjectStoreError(`Project does not exist: ${slug}`);
  }

  return projectDirectory;
}

export function transitionProjectState(
  slugInput: string,
  nextStatus: ProjectStateValue,
  cwd = process.cwd(),
): ProjectState {
  const slug = requireSlug(slugInput);
  const current = readProjectState(slug, cwd);

  if (current.status === nextStatus) {
    return current;
  }

  assertTransition(current.status, nextStatus);
  const next = projectStateSchema.parse({ status: nextStatus });
  writeJson(join(resolveProjectDirectory(slug, cwd), "state.json"), next);
  return next;
}

export function readProjectMediaRecords(slugInput: string, cwd = process.cwd()): MediaRecord[] {
  const slug = requireSlug(slugInput);
  const mediaProbePath = join(resolveProjectDirectory(slug, cwd), "derived", "media-probe.json");

  if (!existsSync(mediaProbePath)) {
    return [];
  }

  let rawRecords: unknown;
  try {
    rawRecords = JSON.parse(readFileSync(mediaProbePath, "utf8"));
  } catch {
    throw new ProjectStoreError(`Unable to read valid media probe records for: ${slug}`);
  }

  const parsed = mediaRecordListSchema.safeParse(rawRecords);
  if (!parsed.success) {
    throw new ProjectStoreError(`Invalid media probe records for: ${slug}`);
  }

  return parsed.data;
}

export function appendProjectMediaRecord(slugInput: string, media: MediaRecord, cwd = process.cwd()): void {
  const slug = requireSlug(slugInput);
  const record = mediaRecordSchema.parse(media);
  const records = readProjectMediaRecords(slug, cwd);

  records.push(record);
  writeJson(join(resolveProjectDirectory(slug, cwd), "derived", "media-probe.json"), records);
}

export function appendProjectEvent(slugInput: string, event: EventRecord, cwd = process.cwd()): void {
  const slug = requireSlug(slugInput);
  const record = eventRecordSchema.parse(event);

  appendFileSync(
    join(resolveProjectDirectory(slug, cwd), "events.ndjson"),
    `${JSON.stringify(record)}\n`,
    "utf8",
  );
}

export function readProjectTranscript(slugInput: string, cwd = process.cwd()): TranscriptDocument | undefined {
  const slug = requireSlug(slugInput);
  const transcriptPath = join(resolveProjectDirectory(slug, cwd), "derived", "transcript.json");

  if (!existsSync(transcriptPath)) {
    return undefined;
  }

  let rawTranscript: unknown;
  try {
    rawTranscript = JSON.parse(readFileSync(transcriptPath, "utf8"));
  } catch {
    throw new ProjectStoreError(`Unable to read valid transcript for: ${slug}`);
  }

  const parsed = transcriptDocumentSchema.safeParse(rawTranscript);
  if (!parsed.success) {
    throw new ProjectStoreError(`Invalid transcript for: ${slug}`);
  }

  return parsed.data;
}

export function readProjectAssetPlan(slugInput: string, cwd = process.cwd()): AssetPlan | undefined {
  const slug = requireSlug(slugInput);
  const planPath = join(resolveProjectDirectory(slug, cwd), "plans", "asset-plan.json");

  if (!existsSync(planPath)) {
    return undefined;
  }

  let rawPlan: unknown;
  try {
    rawPlan = JSON.parse(readFileSync(planPath, "utf8"));
  } catch {
    throw new ProjectStoreError(`Unable to read valid asset plan for: ${slug}`);
  }

  const parsed = assetPlanSchema.safeParse(rawPlan);
  if (!parsed.success || parsed.data.project_slug !== slug) {
    throw new ProjectStoreError(`Invalid asset plan for: ${slug}`);
  }

  return parsed.data;
}

export function writeProjectAssetPlan(slugInput: string, plan: AssetPlan, cwd = process.cwd()): void {
  const slug = requireSlug(slugInput);
  const parsed = assetPlanSchema.parse(plan);
  if (parsed.project_slug !== slug) {
    throw new ProjectStoreError("Asset plan project_slug must match the target project");
  }

  writeJson(join(resolveProjectDirectory(slug, cwd), "plans", "asset-plan.json"), parsed);
}

export function readProjectAssetManifest(slugInput: string, cwd = process.cwd()): AssetManifest {
  const slug = requireSlug(slugInput);
  const manifestPath = join(resolveProjectDirectory(slug, cwd), "assets", "manifest.json");

  if (!existsSync(manifestPath)) {
    return { version: 1, assets: [] };
  }

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    throw new ProjectStoreError(`Unable to read valid asset manifest for: ${slug}`);
  }

  const parsed = assetManifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    throw new ProjectStoreError(`Invalid asset manifest for: ${slug}`);
  }

  return parsed.data;
}

export function writeProjectAssetManifest(slugInput: string, manifest: AssetManifest, cwd = process.cwd()): void {
  const slug = requireSlug(slugInput);
  const parsed = assetManifestSchema.parse(manifest);
  writeJson(join(resolveProjectDirectory(slug, cwd), "assets", "manifest.json"), parsed);
}

export function writeProjectGenerationBudget(
  slugInput: string,
  budget: ProjectGenerationBudget,
  cwd = process.cwd(),
): ProjectIdentity {
  const slug = requireSlug(slugInput);
  const identity = readProjectIdentity(slug, cwd);
  const next = projectIdentitySchema.parse({
    ...identity,
    budget: projectGenerationBudgetSchema.parse(budget),
  });
  writeJson(join(resolveProjectDirectory(slug, cwd), "project.json"), next);
  return next;
}

/** Writes only Creator Pipeline's normalized transcription artifacts. */
export function writeProjectTranscriptionArtifacts(
  slugInput: string,
  transcript: TranscriptDocument,
  silenceMap: SilenceMap,
  cwd = process.cwd(),
): void {
  const slug = requireSlug(slugInput);
  const parsedTranscript = transcriptDocumentSchema.parse(transcript);
  const parsedSilenceMap = silenceMapSchema.parse(silenceMap);

  if (parsedSilenceMap.source_media_id !== parsedTranscript.source_media_id) {
    throw new ProjectStoreError("Silence map source_media_id must match transcript source_media_id");
  }

  const derivedDirectory = join(resolveProjectDirectory(slug, cwd), "derived");
  writeJson(join(derivedDirectory, "transcript.json"), parsedTranscript);
  writeFileSync(join(derivedDirectory, "transcript.srt"), renderSrt(parsedTranscript.segments), "utf8");
  writeJson(join(derivedDirectory, "silence-map.json"), parsedSilenceMap);
}

function requireSlug(input: string): string {
  const parsed = projectSlugSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProjectStoreError(`Invalid project slug: ${input}`);
  }

  return parsed.data;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
