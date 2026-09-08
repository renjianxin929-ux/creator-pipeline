import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadStyleOS } from "../brand/style-os.js";
import { resolveProjectBrand } from "../brand/project-brand.js";
import {
  DIRECTOR_DECISIONS_RELATIVE_PATH,
  DIRECTOR_PLAN_RELATIVE_PATH,
  DIRECTOR_REVIEW_CONTEXT_RELATIVE_PATH,
  DIRECTOR_REVIEW_INPUT_RELATIVE_PATH,
  directorSegmentSchema,
  founderDecisionDatasetSchema,
  isDirectorPlanStale,
  parseFounderReviewCapture,
  parseFounderReviewContext,
  type DirectorPlan,
  type DirectorSegment,
  type FounderDecisionDataset,
  type FounderReviewCapture,
  type FounderReviewContext,
  type FounderReviewSession,
} from "../contracts/index.js";
import { isDirectorContextStale } from "../director/compile-context.js";
import { sha256File } from "../project/file-hash.js";
import {
  readProjectDirectorContext,
  readProjectDirectorDecisions,
  readProjectDirectorPlan,
  readProjectEditPlan,
  readProjectFrozenScriptIdentity,
  readProjectIdentity,
  resolveProjectDirectory,
  writeProjectDirectorDecisions,
} from "../project/project-store.js";

export class FounderReviewError extends Error {
  override name = "FounderReviewError";
}

const PREVIEW_RELATIVE_PATH = "render/preview.mp4";
const EDIT_PLAN_RELATIVE_PATH = "plans/edit-plan.json";

interface CurrentReviewArtifacts {
  context: FounderReviewContext;
  plan: DirectorPlan;
}

/**
 * P9.4B prepare: snapshot the current DirectorPlan, DirectorContext, frozen
 * script, EditPlan, and Preview identities into a review pack. The pack never
 * contains Founder decisions.
 */
export function prepareFounderReview(slug: string, cwd = process.cwd()): FounderReviewContext {
  const artifacts = readCurrentReviewArtifacts(slug, cwd);
  writeFileSync(
    join(resolveProjectDirectory(slug, cwd), DIRECTOR_REVIEW_CONTEXT_RELATIVE_PATH),
    `${JSON.stringify(artifacts.context, null, 2)}\n`,
    "utf8",
  );
  return artifacts.context;
}

export function readFounderReviewContext(slug: string, cwd = process.cwd()): FounderReviewContext | undefined {
  const contextPath = join(resolveProjectDirectory(slug, cwd), DIRECTOR_REVIEW_CONTEXT_RELATIVE_PATH);
  if (!existsSync(contextPath)) {
    return undefined;
  }

  let rawContext: unknown;
  try {
    rawContext = JSON.parse(readFileSync(contextPath, "utf8"));
  } catch {
    throw new FounderReviewError(`Unable to read Founder review context for ${slug}`);
  }

  const parsed = parseFounderReviewContext(rawContext);
  if (parsed.project_slug !== slug) {
    throw new FounderReviewError(`Invalid Founder review context for ${slug}`);
  }
  return parsed;
}

/**
 * P9.4B import: validate an external capture against the current review
 * context and DirectorPlan, then append one Review Session through the
 * official dataset writer. Rejected captures never write.
 */
export function importFounderReview(
  slug: string,
  captureFilePath: string,
  cwd = process.cwd(),
): FounderDecisionDataset {
  const resolvedCapturePath = resolve(cwd, captureFilePath);
  const officialDatasetPath = join(resolveProjectDirectory(slug, cwd), DIRECTOR_DECISIONS_RELATIVE_PATH);
  if (resolvedCapturePath === officialDatasetPath) {
    throw new FounderReviewError(
      `External review capture must not target ${DIRECTOR_DECISIONS_RELATIVE_PATH}; use the import gate`,
    );
  }

  let rawCapture: unknown;
  try {
    rawCapture = JSON.parse(readFileSync(resolvedCapturePath, "utf8"));
  } catch {
    throw new FounderReviewError(`Unable to read Founder review capture JSON from ${captureFilePath}`);
  }

  const storedContext = readFounderReviewContext(slug, cwd);
  if (storedContext === undefined) {
    throw new FounderReviewError(`No Founder review context exists for ${slug}; run director review prepare first`);
  }

  const previous = readProjectDirectorDecisions(slug, cwd);
  const artifacts = readCurrentReviewArtifacts(slug, cwd);
  if (stableStringify(artifacts.context) !== stableStringify(storedContext)) {
    throw new FounderReviewError(`Founder review context for ${slug} is stale; re-run director review prepare`);
  }

  const capture = parseFounderReviewCapture(rawCapture);
  assertCaptureMatchesContext(capture, storedContext);
  assertDecisionsMatchPlan(capture, artifacts.plan);

  const session: FounderReviewSession = {
    review_id: capture.review_id,
    director_plan_identity: capture.director_plan_identity,
    preview_reference: capture.preview_reference,
    decisions: capture.decisions,
  };

  const next = founderDecisionDatasetSchema.parse({
    version: 1,
    project_slug: storedContext.project_slug,
    project_id: storedContext.project_id,
    reviews: [...(previous?.reviews ?? []), session],
  });

  writeProjectDirectorDecisions(slug, next, cwd);
  return next;
}

function readCurrentReviewArtifacts(slug: string, cwd: string): CurrentReviewArtifacts {
  const identity = readProjectIdentity(slug, cwd);
  const frozen = readProjectFrozenScriptIdentity(slug, cwd);
  if (frozen === undefined) {
    throw new FounderReviewError(`Cannot prepare a Founder review for ${slug} without content/frozen-script.md`);
  }

  const directorContext = readProjectDirectorContext(slug, cwd);
  if (directorContext === undefined) {
    throw new FounderReviewError(`No DirectorContext exists for ${slug}; run director prepare first`);
  }

  const plan = readProjectDirectorPlan(slug, cwd);
  if (plan === undefined) {
    throw new FounderReviewError(`No DirectorPlan exists for ${slug}; run director import first`);
  }

  const editPlan = readProjectEditPlan(slug, cwd);
  if (editPlan === undefined) {
    throw new FounderReviewError(`No EditPlan exists for ${slug}; run the classic edit path first`);
  }

  const projectDirectory = resolveProjectDirectory(slug, cwd);
  const previewPath = join(projectDirectory, PREVIEW_RELATIVE_PATH);
  if (!existsSync(previewPath) || !statSync(previewPath).isFile()) {
    throw new FounderReviewError(`Preview does not exist for ${slug}; render/preview.mp4 is required`);
  }

  const styleVersion = loadStyleOS(resolveProjectBrand(slug, cwd).brand.brand_version, cwd).style_version;
  if (isDirectorContextStale(directorContext, identity, frozen.sha256, styleVersion)) {
    throw new FounderReviewError(`DirectorContext for ${slug} is stale; re-run director prepare`);
  }
  if (isDirectorPlanStale(plan, frozen.sha256)) {
    throw new FounderReviewError(`DirectorPlan for ${slug} is stale; re-run director import`);
  }
  if (
    plan.frozen_script.byte_size !== frozen.byte_size ||
    plan.style_reference.style_version !== directorContext.style_version ||
    plan.style_reference.style_version !== styleVersion
  ) {
    throw new FounderReviewError(`DirectorPlan for ${slug} does not match the current frozen script or style version`);
  }

  const context = parseFounderReviewContext({
    version: 1,
    project_slug: identity.slug,
    project_id: identity.id,
    director_plan_identity: {
      director_plan_sha256: sha256File(join(projectDirectory, DIRECTOR_PLAN_RELATIVE_PATH)),
      frozen_script_sha256: frozen.sha256,
      frozen_script_byte_size: frozen.byte_size,
      style_version: plan.style_reference.style_version,
    },
    preview_reference: {
      preview_path: PREVIEW_RELATIVE_PATH,
      preview_sha256: sha256File(previewPath),
      edit_plan_sha256: sha256File(join(projectDirectory, EDIT_PLAN_RELATIVE_PATH)),
    },
    available_segment_ids: plan.segments.map((segment) => segment.segment_id),
    expected_input_path: DIRECTOR_REVIEW_INPUT_RELATIVE_PATH,
  });

  return { context, plan };
}

function assertCaptureMatchesContext(capture: FounderReviewCapture, context: FounderReviewContext): void {
  if (capture.project_slug !== context.project_slug || capture.project_id !== context.project_id) {
    throw new FounderReviewError("Review capture project identity does not match the current review context");
  }
  if (stableStringify(capture.director_plan_identity) !== stableStringify(context.director_plan_identity)) {
    throw new FounderReviewError("Review capture DirectorPlan identity does not match the current review context");
  }
  if (stableStringify(capture.preview_reference) !== stableStringify(context.preview_reference)) {
    throw new FounderReviewError("Review capture Preview reference does not match the current review context");
  }
}

function assertDecisionsMatchPlan(capture: FounderReviewCapture, plan: DirectorPlan): void {
  const segments = new Map(plan.segments.map((segment) => [segment.segment_id, segment]));
  for (const decision of capture.decisions) {
    const current = segments.get(decision.segment_id);
    if (current === undefined) {
      throw new FounderReviewError(
        `Review capture segment ${decision.segment_id} is not in the reviewed DirectorPlan`,
      );
    }
    if (canonicalSegment(decision.proposal) !== canonicalSegment(current)) {
      throw new FounderReviewError(
        `Review capture proposal does not match reviewed segment ${decision.segment_id}`,
      );
    }
  }
}

function canonicalSegment(segment: DirectorSegment): string {
  return stableStringify(directorSegmentSchema.parse(segment));
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

export { DIRECTOR_REVIEW_CONTEXT_RELATIVE_PATH, DIRECTOR_REVIEW_INPUT_RELATIVE_PATH, PREVIEW_RELATIVE_PATH };
