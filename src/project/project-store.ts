import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import {
  createInitialState,
  eventRecordSchema,
  projectIdentitySchema,
  projectSlugSchema,
  projectStateSchema,
  type ProjectIdentity,
  type ProjectState,
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

export function readProjectState(slugInput: string, cwd = process.cwd()): ProjectState {
  const slug = requireSlug(slugInput);
  const statePath = join(resolveWorkspaceRoot(cwd), "projects", slug, "state.json");

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
