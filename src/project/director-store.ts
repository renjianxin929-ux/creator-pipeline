import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  directorPlanSchema,
  isDirectorPlanStale,
  projectSlugSchema,
  type DirectorPlan,
} from "../contracts/index.js";
import { sha256File } from "./file-hash.js";
import { ProjectStoreError, resolveProjectDirectory } from "./project-store.js";

export interface FrozenScriptSnapshot {
  path: "content/frozen-script.md";
  content: string;
  sha256: string;
}

const FROZEN_SCRIPT_RELATIVE_PATH = "content/frozen-script.md" as const;
const DIRECTOR_PLAN_RELATIVE_PATH = "plans/director-plan.json" as const;

export function writeProjectFrozenScript(
  slugInput: string,
  content: string,
  cwd = process.cwd(),
): FrozenScriptSnapshot {
  const slug = requireSlug(slugInput);
  if (content.trim().length === 0) {
    throw new ProjectStoreError("Frozen script must not be empty");
  }

  const path = join(resolveProjectDirectory(slug, cwd), FROZEN_SCRIPT_RELATIVE_PATH);
  writeFileSync(path, content, "utf8");
  return readProjectFrozenScript(slug, cwd)!;
}

export function readProjectFrozenScript(
  slugInput: string,
  cwd = process.cwd(),
): FrozenScriptSnapshot | undefined {
  const slug = requireSlug(slugInput);
  const path = join(resolveProjectDirectory(slug, cwd), FROZEN_SCRIPT_RELATIVE_PATH);

  if (!existsSync(path)) {
    return undefined;
  }

  return {
    path: FROZEN_SCRIPT_RELATIVE_PATH,
    content: readFileSync(path, "utf8"),
    sha256: sha256File(path),
  };
}

export function writeProjectDirectorPlan(
  slugInput: string,
  planInput: DirectorPlan,
  cwd = process.cwd(),
): void {
  const slug = requireSlug(slugInput);
  const plan = directorPlanSchema.parse(planInput);

  if (plan.project_slug !== slug) {
    throw new ProjectStoreError("Director Plan project_slug must match the target project");
  }

  const frozenScript = readProjectFrozenScript(slug, cwd);
  if (frozenScript === undefined) {
    throw new ProjectStoreError("Director Plan requires content/frozen-script.md");
  }
  if (isDirectorPlanStale(plan, frozenScript.sha256)) {
    throw new ProjectStoreError(
      "Director Plan source_script hash does not match the current frozen script",
    );
  }

  writeJson(join(resolveProjectDirectory(slug, cwd), DIRECTOR_PLAN_RELATIVE_PATH), plan);
}

export function readProjectDirectorPlan(
  slugInput: string,
  cwd = process.cwd(),
): DirectorPlan | undefined {
  const slug = requireSlug(slugInput);
  const path = join(resolveProjectDirectory(slug, cwd), DIRECTOR_PLAN_RELATIVE_PATH);

  if (!existsSync(path)) {
    return undefined;
  }

  let rawPlan: unknown;
  try {
    rawPlan = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new ProjectStoreError(`Unable to read valid Director Plan for: ${slug}`);
  }

  const parsed = directorPlanSchema.safeParse(rawPlan);
  if (!parsed.success || parsed.data.project_slug !== slug) {
    throw new ProjectStoreError(`Invalid Director Plan for: ${slug}`);
  }

  const frozenScript = readProjectFrozenScript(slug, cwd);
  if (frozenScript === undefined) {
    throw new ProjectStoreError(`Director Plan is stale because frozen script is missing: ${slug}`);
  }
  if (isDirectorPlanStale(parsed.data, frozenScript.sha256)) {
    throw new ProjectStoreError(`Director Plan is stale for current frozen script: ${slug}`);
  }

  return parsed.data;
}

export function isProjectDirectorPlanStale(
  slugInput: string,
  cwd = process.cwd(),
): boolean {
  const slug = requireSlug(slugInput);
  const path = join(resolveProjectDirectory(slug, cwd), DIRECTOR_PLAN_RELATIVE_PATH);

  if (!existsSync(path)) {
    return false;
  }

  let rawPlan: unknown;
  try {
    rawPlan = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new ProjectStoreError(`Unable to read valid Director Plan for: ${slug}`);
  }

  const parsed = directorPlanSchema.safeParse(rawPlan);
  if (!parsed.success || parsed.data.project_slug !== slug) {
    throw new ProjectStoreError(`Invalid Director Plan for: ${slug}`);
  }

  const frozenScript = readProjectFrozenScript(slug, cwd);
  return frozenScript === undefined || isDirectorPlanStale(parsed.data, frozenScript.sha256);
}

export function removeProjectDirectorPlan(slugInput: string, cwd = process.cwd()): void {
  const slug = requireSlug(slugInput);
  rmSync(join(resolveProjectDirectory(slug, cwd), DIRECTOR_PLAN_RELATIVE_PATH), { force: true });
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
