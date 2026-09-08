import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import {
  brandVersionSchema,
  DIRECTOR_CONTEXT_RELATIVE_PATH,
  isDirectorPlanStale,
  sha256Schema,
  type DirectorContext,
  type DirectorPlan,
  type ProjectIdentity,
} from "../contracts/index.js";
import { loadStyleOS } from "../brand/style-os.js";
import { resolveProjectBrand } from "../brand/project-brand.js";
import { augmentEditPlanWithDirection, type DirectorEditAugmentation } from "./apply-to-edit.js";
import { compileDirectorContext, isDirectorContextStale } from "./compile-context.js";
import { importManualDirectorPlan } from "./validate-plan.js";
import {
  readProjectAssetManifest,
  readProjectDirectorContext,
  readProjectDirectorPlan,
  readProjectEditPlan,
  readProjectFrozenScript,
  readProjectFrozenScriptIdentity,
  readProjectIdentity,
  readProjectMediaRecords,
  readProjectTranscript,
  resolveProjectDirectory,
  writeProjectDirectorContext,
  writeProjectDirectorPlan,
  writeProjectEditPlan,
} from "../project/project-store.js";

export class DirectorHandoffError extends Error {
  override name = "DirectorHandoffError";
}

/** Project-relative path of the machine-readable Director job envelope. */
export const DIRECTOR_JOB_RELATIVE_PATH = "plans/director-job.json";

/**
 * Staging path for unvalidated external Director output. External agents
 * deliver here and only here: plans/director-plan.json is the validated
 * official store and is written solely by Creator Pipeline after the full
 * import gate passes. The staging file is never runtime truth.
 */
export const DIRECTOR_OUTPUT_RELATIVE_PATH = "plans/director-output.json";

/**
 * Handoff envelope: where the authoritative context lives, what output is
 * expected, and where that staging output must be delivered. It names no
 * provider, model, or vendor — any external Director reads the same file.
 * The envelope is fully determined by current project facts, so repeated
 * prepares are byte-identical.
 */
export const directorJobSchema = z
  .object({
    version: z.literal(1),
    project_slug: z.string().min(1),
    project_id: z.string().min(1),
    context_path: z.literal(DIRECTOR_CONTEXT_RELATIVE_PATH),
    frozen_script: z
      .object({
        sha256: sha256Schema,
        byte_size: z.number().int().nonnegative(),
      })
      .strict(),
    style_version: brandVersionSchema,
    expected_output_contract: z
      .object({
        kind: z.literal("director-plan"),
        version: z.literal(1),
      })
      .strict(),
    expected_output_path: z.literal(DIRECTOR_OUTPUT_RELATIVE_PATH),
  })
  .strict();
export type DirectorJob = z.infer<typeof directorJobSchema>;

export interface PreparedDirectorJob {
  context: DirectorContext;
  job: DirectorJob;
}

/**
 * P9.3C prepare: compiles the deterministic DirectorContext from the real
 * project (identity, frozen bytes, style snapshot, transcript/media/assets
 * when present) and persists it plus a provider-neutral job envelope as
 * structured runtime state.
 */
export function prepareDirectorJob(slug: string, cwd = process.cwd()): PreparedDirectorJob {
  const identity = readProjectIdentity(slug, cwd);
  const frozenText = readProjectFrozenScript(slug, cwd);
  if (frozenText === undefined) {
    throw new DirectorHandoffError(
      `Cannot prepare a Director job for ${slug} without content/frozen-script.md`,
    );
  }

  const brandVersion = resolveProjectBrand(slug, cwd).brand.brand_version;
  const snapshot = loadStyleOS(brandVersion, cwd);
  const context = compileDirectorContext({
    project: identity,
    frozenScriptText: frozenText,
    styleSnapshot: snapshot,
    transcript: readProjectTranscript(slug, cwd),
    mediaRecords: readProjectMediaRecords(slug, cwd),
    assetRecords: readProjectAssetManifest(slug, cwd).assets,
  });

  writeProjectDirectorContext(slug, context, cwd);
  const job = directorJobSchema.parse({
    version: 1,
    project_slug: identity.slug,
    project_id: identity.id,
    context_path: DIRECTOR_CONTEXT_RELATIVE_PATH,
    frozen_script: {
      sha256: context.frozen_script.sha256,
      byte_size: context.frozen_script.byte_size,
    },
    style_version: context.style_version,
    expected_output_contract: { kind: "director-plan", version: 1 },
    expected_output_path: DIRECTOR_OUTPUT_RELATIVE_PATH,
  });
  writeFileSync(
    join(resolveProjectDirectory(slug, cwd), DIRECTOR_JOB_RELATIVE_PATH),
    `${JSON.stringify(job, null, 2)}\n`,
    "utf8",
  );

  return { context, job };
}

/**
 * P9.3C import: the single entry point for every external Director.
 * Returned plans pass parse → context binding → style compliance before
 * they may become the project's official DirectorPlan; anything else is
 * rejected and the stored plan is left untouched. The stored context must
 * itself still be current — a stale context can no longer validate plans.
 */
export function importDirectorPlan(
  slug: string,
  planFilePath: string,
  cwd = process.cwd(),
): DirectorPlan {
  let rawPlan: unknown;
  try {
    rawPlan = JSON.parse(readFileSync(resolve(cwd, planFilePath), "utf8"));
  } catch {
    throw new DirectorHandoffError(`Unable to read DirectorPlan JSON from ${planFilePath}`);
  }

  const context = readProjectDirectorContext(slug, cwd);
  if (context === undefined) {
    throw new DirectorHandoffError(
      `No DirectorContext exists for ${slug}; run director prepare first`,
    );
  }

  const state = readCurrentHandoffState(slug, cwd);
  if (isDirectorContextStale(context, state.identity, state.frozen.sha256, state.styleVersion)) {
    throw new DirectorHandoffError(
      `DirectorContext for ${slug} is stale; re-run director prepare`,
    );
  }

  const plan = importManualDirectorPlan(rawPlan, context);
  writeProjectDirectorPlan(slug, plan, cwd);
  return plan;
}

/**
 * P9.3C apply: derives the single updated EditPlan from a validated
 * DirectorPlan. Stale plans and stale contexts are both rejected; a
 * missing EditPlan means the classic edit path must run first.
 */
export function applyDirectorPlan(slug: string, cwd = process.cwd()): DirectorEditAugmentation {
  const context = readProjectDirectorContext(slug, cwd);
  if (context === undefined) {
    throw new DirectorHandoffError(
      `No DirectorContext exists for ${slug}; run director prepare first`,
    );
  }

  const plan = readProjectDirectorPlan(slug, cwd);
  if (plan === undefined) {
    throw new DirectorHandoffError(
      `No DirectorPlan exists for ${slug}; run director import first`,
    );
  }

  const state = readCurrentHandoffState(slug, cwd);
  if (isDirectorContextStale(context, state.identity, state.frozen.sha256, state.styleVersion)) {
    throw new DirectorHandoffError(
      `DirectorContext for ${slug} is stale; re-run director prepare`,
    );
  }
  if (isDirectorPlanStale(plan, state.frozen.sha256)) {
    throw new DirectorHandoffError(`DirectorPlan for ${slug} is stale; re-run director import`);
  }

  const base = readProjectEditPlan(slug, cwd);
  if (base === undefined) {
    throw new DirectorHandoffError(
      `No EditPlan exists for ${slug}; run the classic edit path first`,
    );
  }

  const result = augmentEditPlanWithDirection(base, plan, context);
  writeProjectEditPlan(slug, result.plan, cwd);
  return result;
}

/** Reads back a prepared job envelope, or undefined when never prepared. */
export function readDirectorJob(slug: string, cwd = process.cwd()): DirectorJob | undefined {
  const jobPath = join(resolveProjectDirectory(slug, cwd), DIRECTOR_JOB_RELATIVE_PATH);
  if (!existsSync(jobPath)) {
    return undefined;
  }

  let rawJob: unknown;
  try {
    rawJob = JSON.parse(readFileSync(jobPath, "utf8"));
  } catch {
    throw new DirectorHandoffError(`Unable to read Director job for ${slug}`);
  }

  const parsed = directorJobSchema.safeParse(rawJob);
  if (!parsed.success || parsed.data.project_slug !== slug) {
    throw new DirectorHandoffError(`Invalid Director job for ${slug}`);
  }
  return parsed.data;
}

interface CurrentHandoffState {
  identity: ProjectIdentity;
  frozen: { sha256: string; byte_size: number };
  styleVersion: string;
}

/** Current identity, frozen bytes, and style version every gate compares against. */
function readCurrentHandoffState(slug: string, cwd: string): CurrentHandoffState {
  const identity = readProjectIdentity(slug, cwd);
  const frozen = readProjectFrozenScriptIdentity(slug, cwd);
  if (frozen === undefined) {
    throw new DirectorHandoffError(
      `Cannot verify direction for ${slug} without content/frozen-script.md`,
    );
  }
  const styleVersion = loadStyleOS(
    resolveProjectBrand(slug, cwd).brand.brand_version,
    cwd,
  ).style_version;
  return { identity, frozen, styleVersion };
}
