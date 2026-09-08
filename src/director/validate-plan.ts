import {
  parseDirectorContext,
  parseDirectorPlan,
  type DirectorContext,
  type DirectorPlan,
  type StyleGuidanceItem,
} from "../contracts/index.js";

export class DirectorValidationError extends Error {
  override name = "DirectorValidationError";
}

export type ComplianceTier = "mandatory" | "approved-advisory" | "strong" | "optional";

export interface PlanComplianceIssue {
  tier: ComplianceTier;
  rule_id: string;
  segment_id: string;
  kind: string;
  detail: string;
}

export interface PlanComplianceReport {
  /** FROZEN mandatory deviations. Any entry here fails the plan. */
  violations: PlanComplianceIssue[];
  /** Weaker-tier deviations. Recorded for review, never hard failures. */
  notes: PlanComplianceIssue[];
}

/**
 * P9.3B Context↔Plan consistency gate. Schema validity alone is not
 * enough: the plan must belong to this exact project, this exact frozen
 * byte identity, and this exact style version.
 */
export function assertDirectorPlanBinding(planInput: DirectorPlan, contextInput: DirectorContext): void {
  const plan = parseDirectorPlan(planInput);
  const context = parseDirectorContext(contextInput);

  const mismatches: string[] = [];
  if (plan.project_id !== context.project_id) {
    mismatches.push("project_id");
  }
  if (plan.project_slug !== context.project_slug) {
    mismatches.push("project_slug");
  }
  if (plan.frozen_script.sha256 !== context.frozen_script.sha256) {
    mismatches.push("frozen_script.sha256");
  }
  if (plan.frozen_script.byte_size !== context.frozen_script.byte_size) {
    mismatches.push("frozen_script.byte_size");
  }
  if (plan.style_reference.style_version !== context.style_version) {
    mismatches.push("style_version");
  }

  if (mismatches.length > 0) {
    throw new DirectorValidationError(
      `DirectorPlan does not match its DirectorContext: ${mismatches.join(", ")}`,
    );
  }
}

/**
 * P9.3B deterministic style-compliance check. Only FROZEN mandatory
 * deviations are violations: a segment whose primary visual falls outside
 * a FROZEN editing rule's allowed set (or inside its forbidden set), a
 * motion choice the rule forbids (or requires away from), or decorative
 * B-roll on a role guarded by a FROZEN HARD quality gate.
 *
 * OBSERVED, CANDIDATE, and approved-advisory deviations are recorded as
 * notes. UNSET items never reach guidance, so they can never fail or note.
 * No taste scoring happens here.
 *
 * Both the chosen primary visual and the whole offered allowed_visuals set
 * are checked: listing a forbidden visual as available fails even when the
 * primary pick itself is legal.
 */
export function validateDirectorPlanCompliance(
  planInput: DirectorPlan,
  contextInput: DirectorContext,
): PlanComplianceReport {
  const plan = parseDirectorPlan(planInput);
  const context = parseDirectorContext(contextInput);
  const violations: PlanComplianceIssue[] = [];
  const notes: PlanComplianceIssue[] = [];

  for (const segment of plan.segments) {
    const tierEntries: Array<{ entries: readonly StyleGuidanceItem[]; tier: ComplianceTier }> = [
      { entries: context.style_guidance.mandatory_constraints, tier: "mandatory" },
      { entries: context.style_guidance.approved_advisories, tier: "approved-advisory" },
      { entries: context.style_guidance.strong_guidance, tier: "strong" },
      { entries: context.style_guidance.optional_candidates, tier: "optional" },
    ];
    for (const { entries, tier } of tierEntries) {
      const check: TierCheck = { entries, tier, violations, notes };
      checkEditingRules(segment, check);
      checkQualityGates(segment, check);
    }
  }

  return { violations, notes };
}

/** Throws when the plan carries any FROZEN mandatory violation. */
export function assertDirectorPlanCompliant(
  planInput: DirectorPlan,
  contextInput: DirectorContext,
): PlanComplianceReport {
  const report = validateDirectorPlanCompliance(planInput, contextInput);
  if (report.violations.length > 0) {
    const first = report.violations[0]!;
    throw new DirectorValidationError(
      `DirectorPlan violates ${first.rule_id} on ${first.segment_id}: ${first.detail}`,
    );
  }
  return report;
}

/**
 * Production-safe manual/imported entry point. External or human-authored
 * plans — and, in the future, strong-model output — pass the same
 * parse → binding → compliance gate before entering the downstream flow.
 */
export function importManualDirectorPlan(input: unknown, context: DirectorContext): DirectorPlan {
  const plan = parseDirectorPlan(input);
  assertDirectorPlanBinding(plan, context);
  assertDirectorPlanCompliant(plan, context);
  return plan;
}

interface TierCheck {
  entries: readonly StyleGuidanceItem[];
  tier: ComplianceTier;
  violations: PlanComplianceIssue[];
  notes: PlanComplianceIssue[];
}

function target(check: TierCheck): PlanComplianceIssue[] {
  return check.tier === "mandatory" ? check.violations : check.notes;
}

function checkEditingRules(
  segment: {
    primary_visual: string;
    allowed_visuals: readonly string[];
    semantic_role: string;
    segment_id: string;
    motion_id?: string;
  },
  check: TierCheck,
): void {
  for (const entry of check.entries) {
    if (entry.domain !== "editing-grammar") {
      continue;
    }
    const rule = entry.item;
    if (!(rule.applies_to as readonly string[]).includes(segment.semantic_role)) {
      continue;
    }
    if (!rule.allowed_visuals.includes(segment.primary_visual)) {
      target(check).push({
        tier: check.tier,
        rule_id: rule.id,
        segment_id: segment.segment_id,
        kind: "visual-not-allowed",
        detail: `${segment.primary_visual} is outside the allowed visuals of ${rule.id}`,
      });
    }
    if (rule.forbidden_visuals.includes(segment.primary_visual)) {
      target(check).push({
        tier: check.tier,
        rule_id: rule.id,
        segment_id: segment.segment_id,
        kind: "forbidden-visual",
        detail: `${segment.primary_visual} is forbidden by ${rule.id}`,
      });
    }
    // The whole offered set is constrained, not just the current pick: a
    // segment that lists a forbidden visual as available fails even when
    // its primary visual is legal.
    for (const [index, offered] of segment.allowed_visuals.entries()) {
      if (!rule.allowed_visuals.includes(offered)) {
        target(check).push({
          tier: check.tier,
          rule_id: rule.id,
          segment_id: segment.segment_id,
          kind: "allowed-set-not-permitted",
          detail: `allowed_visuals[${index}] ${offered} is outside the allowed visuals of ${rule.id}`,
        });
      }
      if (rule.forbidden_visuals.includes(offered)) {
        target(check).push({
          tier: check.tier,
          rule_id: rule.id,
          segment_id: segment.segment_id,
          kind: "allowed-set-forbidden",
          detail: `allowed_visuals[${index}] ${offered} is forbidden by ${rule.id}`,
        });
      }
    }
    if (
      segment.motion_id !== undefined &&
      rule.allowed_motion_ids.length > 0 &&
      !rule.allowed_motion_ids.includes(segment.motion_id)
    ) {
      target(check).push({
        tier: check.tier,
        rule_id: rule.id,
        segment_id: segment.segment_id,
        kind: "motion-not-allowed",
        detail: `${segment.motion_id} is outside the allowed motions of ${rule.id}`,
      });
    }
    if (
      segment.motion_id !== undefined &&
      rule.forbidden_motion_ids.includes(segment.motion_id)
    ) {
      target(check).push({
        tier: check.tier,
        rule_id: rule.id,
        segment_id: segment.segment_id,
        kind: "forbidden-motion",
        detail: `${segment.motion_id} is forbidden by ${rule.id}`,
      });
    }
  }
}

function checkQualityGates(
  segment: { primary_visual: string; semantic_role: string; segment_id: string },
  check: TierCheck,
): void {
  for (const entry of check.entries) {
    if (entry.domain !== "quality-gates") {
      continue;
    }
    const gate = entry.item;
    // Severity never upgrades lifecycle: HARD gates in weaker tiers still
    // land in notes because the caller routes by tier, not by severity.
    if (gate.severity !== "HARD") {
      continue;
    }
    if (
      gate.applies_to_roles !== undefined &&
      !(gate.applies_to_roles as readonly string[]).includes(segment.semantic_role)
    ) {
      continue;
    }
    // v1 structural convention from the frozen acceptance language:
    // decorative B-roll is identified by its terminal id segment.
    const terminal = segment.primary_visual.split(".").at(-1);
    if (terminal === "decorative-broll") {
      target(check).push({
        tier: check.tier,
        rule_id: gate.id,
        segment_id: segment.segment_id,
        kind: "decorative-broll-gated",
        detail: `${segment.primary_visual} is decorative B-roll guarded by ${gate.id}`,
      });
    }
  }
}
