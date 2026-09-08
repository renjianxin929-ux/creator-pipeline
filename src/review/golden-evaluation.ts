import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  directorPlanSchema,
  GOLDEN_SET_RELATIVE_PATH,
  parseDirectorPlan,
  parseGoldenSet,
  type DirectorContext,
  type DirectorPlan,
  type DirectorSegment,
  type GoldenEntry,
  type GoldenSet,
} from "../contracts/index.js";
import { validateDirectorPlanCompliance, type PlanComplianceIssue } from "../director/validate-plan.js";
import { sha256Bytes } from "../project/file-hash.js";

export class GoldenEvaluationError extends Error {
  override name = "GoldenEvaluationError";
}

/**
 * Founder Edit Distance v1 compares seven structured Director fields.
 * It is not a perceptual quality score, aesthetic rating, or director
 * ranking. 0 means those fields match; 1 means maximum structured difference.
 */
export const FOUNDER_EDIT_DISTANCE_FIELDS = [
  "semantic_role",
  "primary_visual",
  "allowed_visuals",
  "forbidden_visuals",
  "caption_mode",
  "emphasis_text",
  "motion_id",
] as const;

export const FOUNDER_EDIT_DISTANCE_FIELD_COUNT = FOUNDER_EDIT_DISTANCE_FIELDS.length;

export interface AgreementMetrics {
  semantic_role_agreement: number | null;
  primary_visual_agreement: number | null;
  caption_mode_agreement: number | null;
  motion_agreement: number | null;
  matched_segment_count: number;
}

export interface GoldenFieldDifference {
  segment_id: string;
  field: (typeof FOUNDER_EDIT_DISTANCE_FIELDS)[number];
  reference: unknown;
  candidate: unknown;
}

export interface GoldenPlanIdentity {
  project_slug: string;
  project_id: string;
  frozen_script_sha256: string;
  style_version: string;
  director_plan_sha256: string;
}

export interface GoldenComparisonReport {
  reference_identity: GoldenPlanIdentity;
  candidate_identity: GoldenPlanIdentity;
  hard_rule_violations: PlanComplianceIssue[];
  agreement: AgreementMetrics;
  founder_edit_distance_v1: number;
  missing_segments: string[];
  extra_segments: string[];
  field_differences: GoldenFieldDifference[];
}

export interface CrossDirectorGoldenComparison {
  reports: GoldenComparisonReport[];
}

export function readOfficialGoldenSet(cwd = process.cwd()): GoldenSet {
  const raw = JSON.parse(readFileSync(join(cwd, GOLDEN_SET_RELATIVE_PATH), "utf8")) as unknown;
  return parseGoldenSet(raw);
}

export function addGoldenEntry(set: GoldenSet, entry: GoldenEntry): GoldenSet {
  return parseGoldenSet({
    version: 1,
    entries: [...parseGoldenSet(set).entries, entry],
  });
}

export function evaluateAgainstGolden(
  referencePlanInput: DirectorPlan,
  candidatePlanInput: DirectorPlan,
  context?: DirectorContext,
): GoldenComparisonReport {
  const reference = parseDirectorPlan(referencePlanInput);
  const candidate = parseDirectorPlan(candidatePlanInput);
  assertComparablePlans(reference, candidate);

  const hardRuleViolations =
    context === undefined ? [] : validateDirectorPlanCompliance(candidate, context).violations;

  const referenceIds = reference.segments.map((segment) => segment.segment_id);
  const candidateIds = candidate.segments.map((segment) => segment.segment_id);
  const referenceById = new Map(reference.segments.map((segment) => [segment.segment_id, segment]));
  const candidateById = new Map(candidate.segments.map((segment) => [segment.segment_id, segment]));

  const missingSegments = referenceIds.filter((id) => !candidateById.has(id)).sort();
  const extraSegments = candidateIds.filter((id) => !referenceById.has(id)).sort();
  const matchedIds = referenceIds.filter((id) => candidateById.has(id)).sort();

  const fieldDifferences: GoldenFieldDifference[] = [];
  let matchedEditUnits = 0;
  let roleMatches = 0;
  let visualMatches = 0;
  let captionMatches = 0;
  let motionMatches = 0;

  for (const segmentId of matchedIds) {
    const referenceSegment = referenceById.get(segmentId)!;
    const candidateSegment = candidateById.get(segmentId)!;
    for (const field of FOUNDER_EDIT_DISTANCE_FIELDS) {
      const referenceValue = canonicalizeField(field, readField(referenceSegment, field));
      const candidateValue = canonicalizeField(field, readField(candidateSegment, field));
      if (referenceValue === candidateValue) {
        continue;
      }
      matchedEditUnits += 1;
      fieldDifferences.push({
        segment_id: segmentId,
        field,
        reference: readField(referenceSegment, field) ?? null,
        candidate: readField(candidateSegment, field) ?? null,
      });
    }
    if (referenceSegment.semantic_role === candidateSegment.semantic_role) {
      roleMatches += 1;
    }
    if (referenceSegment.primary_visual === candidateSegment.primary_visual) {
      visualMatches += 1;
    }
    if (referenceSegment.caption_mode === candidateSegment.caption_mode) {
      captionMatches += 1;
    }
    if ((referenceSegment.motion_id ?? null) === (candidateSegment.motion_id ?? null)) {
      motionMatches += 1;
    }
  }

  const editUnits =
    matchedEditUnits +
    missingSegments.length * FOUNDER_EDIT_DISTANCE_FIELD_COUNT +
    extraSegments.length * FOUNDER_EDIT_DISTANCE_FIELD_COUNT;
  const matchedCount = matchedIds.length;
  const agreementDenom = matchedCount === 0 ? null : matchedCount;

  return {
    reference_identity: planIdentity(reference),
    candidate_identity: planIdentity(candidate),
    hard_rule_violations: hardRuleViolations,
    agreement: {
      semantic_role_agreement: ratio(roleMatches, agreementDenom),
      primary_visual_agreement: ratio(visualMatches, agreementDenom),
      caption_mode_agreement: ratio(captionMatches, agreementDenom),
      motion_agreement: ratio(motionMatches, agreementDenom),
      matched_segment_count: matchedCount,
    },
    founder_edit_distance_v1: founderEditDistanceV1(reference.segments, candidate.segments, editUnits),
    missing_segments: missingSegments,
    extra_segments: extraSegments,
    field_differences: fieldDifferences.sort(compareFieldDifference),
  };
}

export function compareCandidatesAgainstGolden(
  referencePlan: DirectorPlan,
  candidates: readonly DirectorPlan[],
  context?: DirectorContext,
): CrossDirectorGoldenComparison {
  return {
    reports: candidates.map((candidate) => evaluateAgainstGolden(referencePlan, candidate, context)),
  };
}

/**
 * Founder Edit Distance v1 = edit_units / (7 * max(ref, cand)).
 * Both-empty plans score 0. The value is a disagreement ratio, not quality.
 */
export function computeFounderEditDistanceV1(
  referenceSegments: readonly DirectorSegment[],
  candidateSegments: readonly DirectorSegment[],
): number {
  if (referenceSegments.length === 0 && candidateSegments.length === 0) {
    return 0;
  }
  const referenceById = new Map(referenceSegments.map((segment) => [segment.segment_id, segment]));
  const candidateById = new Map(candidateSegments.map((segment) => [segment.segment_id, segment]));
  const missing = referenceSegments.filter((segment) => !candidateById.has(segment.segment_id)).length;
  const extra = candidateSegments.filter((segment) => !referenceById.has(segment.segment_id)).length;
  let matchedEditUnits = 0;
  for (const referenceSegment of referenceSegments) {
    const candidateSegment = candidateById.get(referenceSegment.segment_id);
    if (candidateSegment === undefined) {
      continue;
    }
    for (const field of FOUNDER_EDIT_DISTANCE_FIELDS) {
      if (
        canonicalizeField(field, readField(referenceSegment, field)) !==
        canonicalizeField(field, readField(candidateSegment, field))
      ) {
        matchedEditUnits += 1;
      }
    }
  }
  const editUnits =
    matchedEditUnits + missing * FOUNDER_EDIT_DISTANCE_FIELD_COUNT + extra * FOUNDER_EDIT_DISTANCE_FIELD_COUNT;
  return founderEditDistanceV1(referenceSegments, candidateSegments, editUnits);
}

function founderEditDistanceV1(
  referenceSegments: readonly unknown[],
  candidateSegments: readonly unknown[],
  editUnits: number,
): number {
  const denominator =
    FOUNDER_EDIT_DISTANCE_FIELD_COUNT * Math.max(referenceSegments.length, candidateSegments.length);
  if (denominator === 0) {
    return 0;
  }
  const distance = editUnits / denominator;
  if (distance < 0 || distance > 1) {
    throw new GoldenEvaluationError("Founder Edit Distance v1 must stay in 0..1");
  }
  return distance;
}

function assertComparablePlans(reference: DirectorPlan, candidate: DirectorPlan): void {
  const mismatches: string[] = [];
  if (reference.project_id !== candidate.project_id) {
    mismatches.push("project_id");
  }
  if (reference.project_slug !== candidate.project_slug) {
    mismatches.push("project_slug");
  }
  if (reference.frozen_script.sha256 !== candidate.frozen_script.sha256) {
    mismatches.push("frozen_script.sha256");
  }
  if (reference.frozen_script.byte_size !== candidate.frozen_script.byte_size) {
    mismatches.push("frozen_script.byte_size");
  }
  if (reference.style_reference.style_version !== candidate.style_reference.style_version) {
    mismatches.push("style_version");
  }
  if (mismatches.length > 0) {
    throw new GoldenEvaluationError(
      `Cannot compare DirectorPlans with different identities: ${mismatches.join(", ")}`,
    );
  }
}

function planIdentity(plan: DirectorPlan): GoldenPlanIdentity {
  return {
    project_slug: plan.project_slug,
    project_id: plan.project_id,
    frozen_script_sha256: plan.frozen_script.sha256,
    style_version: plan.style_reference.style_version,
    director_plan_sha256: sha256Bytes(Buffer.from(`${JSON.stringify(directorPlanSchema.parse(plan), null, 2)}\n`, "utf8")),
  };
}

function readField(segment: DirectorSegment, field: (typeof FOUNDER_EDIT_DISTANCE_FIELDS)[number]): unknown {
  return segment[field];
}

function canonicalizeField(field: (typeof FOUNDER_EDIT_DISTANCE_FIELDS)[number], value: unknown): string {
  if (field === "allowed_visuals" || field === "forbidden_visuals") {
    const list = Array.isArray(value) ? value.map((item) => String(item)) : [];
    return JSON.stringify([...new Set(list)].sort());
  }
  if (value === undefined) {
    return JSON.stringify(null);
  }
  return JSON.stringify(value);
}

function ratio(matches: number, denom: number | null): number | null {
  if (denom === null) {
    return null;
  }
  return matches / denom;
}

function compareFieldDifference(left: GoldenFieldDifference, right: GoldenFieldDifference): number {
  const segment = left.segment_id.localeCompare(right.segment_id);
  if (segment !== 0) {
    return segment;
  }
  return left.field.localeCompare(right.field);
}
