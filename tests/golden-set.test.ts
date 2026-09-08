import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadStyleOS } from "../src/brand/style-os.ts";
import {
  EMPTY_GOLDEN_SET,
  parseGoldenEntry,
  parseGoldenSet,
} from "../src/contracts/index.ts";
import { compileDirectorContext } from "../src/director/compile-context.ts";
import {
  addGoldenEntry,
  compareCandidatesAgainstGolden,
  computeFounderEditDistanceV1,
  evaluateAgainstGolden,
  readOfficialGoldenSet,
} from "../src/review/golden-evaluation.ts";

const SHA = "a".repeat(64);

function baseProject() {
  return {
    id: "proj-demo-1",
    slug: "demo",
    created_at: "2026-09-08T00:00:00.000Z",
    budget: { generation_cash_cny: 10, used_cash_cny: 0, subscription_generation_count: 0 },
  };
}

const FROZEN_TEXT = "# Demo\n\nLine two.\nLine three.\n";

function emptySnapshot() {
  const seed = loadStyleOS("1.0");
  const empty = { version: 1, style_version: "1.0", items: [] as unknown[] };
  return {
    ...seed,
    editing_grammar: { ...empty },
    visual_grammar: { ...empty },
    motion_library: { ...empty },
    caption_rules: { ...empty },
    quality_gates: { ...empty },
    references: { ...empty },
    reference_inbox: { ...empty },
  };
}

function compileWith(overrides: Record<string, unknown> = {}) {
  return compileDirectorContext({
    project: baseProject(),
    frozenScriptText: FROZEN_TEXT,
    styleSnapshot: emptySnapshot(),
    ...overrides,
  });
}

function segment(overrides: Record<string, unknown> = {}) {
  return {
    segment_id: "seg_01",
    script_anchor: { start_line: 1, end_line: 2 },
    semantic_role: "PROOF",
    primary_visual: "visual.proof.real-demo",
    allowed_visuals: ["visual.proof.real-demo", "visual.proof.screenshot"],
    forbidden_visuals: ["visual.proof.decorative-broll"],
    caption_mode: "emphasis",
    emphasis_text: "show the evidence",
    motion_id: "motion.evidence-highlight",
    reason: "golden fixture",
    confidence: 0.9,
    ...overrides,
  };
}

function plan(context: ReturnType<typeof compileWith>, segments: unknown[]) {
  return {
    version: 1,
    project_slug: context.project_slug,
    project_id: context.project_id,
    frozen_script: { ...context.frozen_script },
    style_reference: { style_version: context.style_version },
    segments,
  };
}

function approval() {
  return {
    approved_by: "founder",
    approved_at: "2026-09-08T00:00:00.000Z",
    evidence_type: "founder_explicit",
  };
}

describe("P9.4D golden set", () => {
  it("accepts an empty official Golden Set seed", () => {
    const official = readOfficialGoldenSet();
    expect(official).toEqual(EMPTY_GOLDEN_SET);
    expect(parseGoldenSet({ version: 1, entries: [] }).entries).toEqual([]);
    expect(JSON.parse(readFileSync(join(process.cwd(), "golden", "set.json"), "utf8")).entries).toEqual([]);
  });

  it("rejects an unapproved entry from becoming official", () => {
    const context = compileWith();
    const reference = plan(context, [segment()]);
    expect(() =>
      parseGoldenEntry({
        golden_id: "golden_01",
        project_slug: context.project_slug,
        project_id: context.project_id,
        frozen_script_sha256: context.frozen_script.sha256,
        frozen_script_byte_size: context.frozen_script.byte_size,
        style_version: context.style_version,
        reference_director_plan: reference,
      }),
    ).toThrow();
    expect(readOfficialGoldenSet().entries).toEqual([]);
  });

  it("requires explicit Founder approval evidence to add a golden entry in memory", () => {
    const context = compileWith();
    const reference = plan(context, [segment()]);
    const entry = parseGoldenEntry({
      golden_id: "golden_01",
      project_slug: context.project_slug,
      project_id: context.project_id,
      frozen_script_sha256: context.frozen_script.sha256,
      frozen_script_byte_size: context.frozen_script.byte_size,
      style_version: context.style_version,
      reference_director_plan: reference,
      approval: approval(),
    });
    const next = addGoldenEntry(EMPTY_GOLDEN_SET, entry);
    expect(next.entries).toHaveLength(1);
    expect(readOfficialGoldenSet().entries).toEqual([]);
  });
});

describe("P9.4D founder edit distance v1", () => {
  it("scores an exact candidate as distance 0", () => {
    const context = compileWith();
    const reference = plan(context, [segment()]);
    const report = evaluateAgainstGolden(reference, reference);
    expect(report.founder_edit_distance_v1).toBe(0);
    expect(report.field_differences).toEqual([]);
  });

  it("scores a single field difference as deterministic and greater than 0", () => {
    const context = compileWith();
    const reference = plan(context, [segment()]);
    const candidate = plan(context, [segment({ caption_mode: "default", emphasis_text: undefined })]);
    const report = evaluateAgainstGolden(reference, candidate);
    expect(report.founder_edit_distance_v1).toBeGreaterThan(0);
    expect(report.founder_edit_distance_v1).toBe(2 / 7);
  });

  it("does not treat reordered identical arrays as a difference", () => {
    const context = compileWith();
    const reference = plan(context, [segment()]);
    const candidate = plan(context, [
      segment({
        allowed_visuals: ["visual.proof.screenshot", "visual.proof.real-demo"],
        forbidden_visuals: ["visual.proof.decorative-broll"],
      }),
    ]);
    expect(evaluateAgainstGolden(reference, candidate).founder_edit_distance_v1).toBe(0);
  });

  it("penalizes missing and extra segments by seven units each", () => {
    const context = compileWith();
    const reference = plan(context, [segment(), segment({ segment_id: "seg_02", script_anchor: { start_line: 3, end_line: 3 } })]);
    const missing = evaluateAgainstGolden(reference, plan(context, [segment()]));
    expect(missing.missing_segments).toEqual(["seg_02"]);
    expect(missing.founder_edit_distance_v1).toBe(7 / 14);

    const extra = evaluateAgainstGolden(
      plan(context, [segment()]),
      plan(context, [segment(), segment({ segment_id: "seg_02", script_anchor: { start_line: 3, end_line: 3 } })]),
    );
    expect(extra.extra_segments).toEqual(["seg_02"]);
    expect(extra.founder_edit_distance_v1).toBe(7 / 14);
  });

  it("keeps distance in 0..1 including both-empty plans", () => {
    expect(computeFounderEditDistanceV1([], [])).toBe(0);
    const context = compileWith();
    const report = evaluateAgainstGolden(plan(context, [segment()]), plan(context, [segment({ semantic_role: "CLAIM" })]));
    expect(report.founder_edit_distance_v1).toBeGreaterThanOrEqual(0);
    expect(report.founder_edit_distance_v1).toBeLessThanOrEqual(1);
  });

  it("computes semantic role, visual, caption, and motion agreement", () => {
    const context = compileWith();
    const reference = plan(context, [
      segment(),
      segment({ segment_id: "seg_02", script_anchor: { start_line: 3, end_line: 3 } }),
    ]);
    const candidate = plan(context, [
      segment({ semantic_role: "CLAIM" }),
      segment({
        segment_id: "seg_02",
        script_anchor: { start_line: 3, end_line: 3 },
        primary_visual: "visual.proof.screenshot",
        allowed_visuals: ["visual.proof.screenshot", "visual.proof.real-demo"],
        caption_mode: "quote",
        motion_id: "motion.ui-focus",
      }),
    ]);
    const report = evaluateAgainstGolden(reference, candidate);
    expect(report.agreement.semantic_role_agreement).toBe(0.5);
    expect(report.agreement.primary_visual_agreement).toBe(0.5);
    expect(report.agreement.caption_mode_agreement).toBe(0.5);
    expect(report.agreement.motion_agreement).toBe(0.5);
  });

  it("reports hard-rule violations separately from director field differences", () => {
    const context = compileDirectorContext({
      project: baseProject(),
      frozenScriptText: FROZEN_TEXT,
      styleSnapshot: {
        ...emptySnapshot(),
        quality_gates: {
          version: 1,
          style_version: "1.0",
          items: [
            {
              id: "quality.proof.no-decorative-cover",
              status: "FROZEN",
              severity: "HARD",
              applies_to_roles: ["PROOF"],
              rule: "Never cover spoken evidence with decorative B-roll.",
              reason: "Evidence must stay visible.",
            },
          ],
        },
      },
    });
    const reference = plan(context, [segment()]);
    const candidate = plan(context, [
      segment({
        primary_visual: "visual.proof.decorative-broll",
        allowed_visuals: ["visual.proof.decorative-broll", "visual.proof.real-demo"],
        forbidden_visuals: [],
      }),
    ]);
    const report = evaluateAgainstGolden(reference, candidate, context);
    expect(report.hard_rule_violations.length).toBeGreaterThan(0);
    expect(report.field_differences.some((difference) => difference.field === "primary_visual")).toBe(true);
    expect(report).not.toHaveProperty("quality_score");
  });

  it("rejects comparison across different frozen scripts", () => {
    const context = compileWith();
    const reference = plan(context, [segment()]);
    const candidate = {
      ...plan(context, [segment()]),
      frozen_script: { ...context.frozen_script, sha256: "b".repeat(64) },
    };
    expect(() => evaluateAgainstGolden(reference, candidate)).toThrow(/frozen_script.sha256/);
  });

  it("is deterministic and does not declare an automatic winner", () => {
    const context = compileWith();
    const reference = plan(context, [segment()]);
    const candidateA = plan(context, [segment({ caption_mode: "default", emphasis_text: undefined })]);
    const candidateB = plan(context, [segment({ motion_id: "motion.ui-focus" })]);
    const first = compareCandidatesAgainstGolden(reference, [candidateA, candidateB]);
    const second = compareCandidatesAgainstGolden(reference, [candidateA, candidateB]);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toMatch(/winner|better|rank|quality score|perceptual/i);
    expect(first.reports).toHaveLength(2);
    expect(first.reports[0]?.reference_identity).toEqual(first.reports[1]?.reference_identity);
    expect(evaluateAgainstGolden(reference, candidateA)).toEqual(first.reports[0]);
  });
});
