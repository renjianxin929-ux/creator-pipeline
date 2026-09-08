import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadStyleOS } from "../src/brand/style-os.ts";
import { augmentEditPlanWithDirection } from "../src/director/apply-to-edit.ts";
import { compileDirectorContext } from "../src/director/compile-context.ts";
import { FakeDirectorAdapter } from "../src/director/fake-director.ts";
import {
  assertDirectorPlanBinding,
  assertDirectorPlanCompliant,
  importManualDirectorPlan,
  validateDirectorPlanCompliance,
} from "../src/director/validate-plan.ts";
import { createRuleBasedEditPlan } from "../src/edit/edit-planner.ts";
import {
  initializeProject,
  readProjectDirectorPlan,
  writeProjectDirectorPlan,
  writeProjectFrozenScript,
} from "../src/project/project-store.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

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

function frozenProofRule(overrides = {}) {
  return {
    id: "editing.proof.real-evidence-first",
    status: "FROZEN",
    applies_to: ["PROOF"],
    rule: "Prefer real evidence over decorative B-roll.",
    allowed_visuals: ["visual.proof.real-demo"],
    forbidden_visuals: ["visual.proof.decorative-broll"],
    why: "Evidence keeps the claim credible.",
    ...overrides,
  };
}

function frozenProofGate(overrides = {}) {
  return {
    id: "quality.proof.no-decorative-cover",
    status: "FROZEN",
    severity: "HARD",
    applies_to_roles: ["PROOF"],
    rule: "Never cover spoken evidence with decorative B-roll.",
    reason: "Evidence must stay visible.",
    ...overrides,
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

function proofSegment(overrides = {}) {
  return {
    segment_id: "seg_01",
    script_anchor: { start_line: 1, end_line: 2 },
    source_range_ms: { start_ms: 0, end_ms: 2000 },
    semantic_role: "PROOF",
    primary_visual: "visual.proof.real-demo",
    allowed_visuals: ["visual.proof.real-demo"],
    caption_mode: "default",
    reason: "Manual fixture.",
    confidence: 0.8,
    ...overrides,
  };
}

function manualPlan(context: ReturnType<typeof compileWith>, segments: unknown[], risks: unknown[] = []) {
  return {
    version: 1,
    project_slug: context.project_slug,
    project_id: context.project_id,
    frozen_script: { ...context.frozen_script },
    style_reference: { style_version: context.style_version },
    segments,
    script_visual_risks: risks,
  };
}

describe("P9.3B fake director path", () => {
  it("turns a DirectorContext into a valid DirectorPlan", async () => {
    const context = compileWith();
    const plan = await new FakeDirectorAdapter().direct(context);

    expect(plan.project_id).toBe("proj-demo-1");
    expect(plan.frozen_script.sha256).toBe(context.frozen_script.sha256);
    expect(plan.segments.length).toBeGreaterThan(0);
    assertDirectorPlanBinding(plan, context);
    expect(assertDirectorPlanCompliant(plan, context).violations).toEqual([]);
  });

  it("is deterministic for the same input", async () => {
    const context = compileWith();
    const adapter = new FakeDirectorAdapter();

    expect(await adapter.direct(context)).toEqual(await adapter.direct(context));
  });
});

describe("P9.3B context↔plan binding", () => {
  it("rejects each mismatched identity field", () => {
    const context = compileWith();
    const good = manualPlan(context, [proofSegment()]);

    expect(() => assertDirectorPlanBinding({ ...good, project_id: "proj-other" }, context)).toThrow(
      /project_id/,
    );
    expect(() => assertDirectorPlanBinding({ ...good, project_slug: "other" }, context)).toThrow(
      /project_slug/,
    );
    expect(() =>
      assertDirectorPlanBinding(
        { ...good, frozen_script: { ...good.frozen_script, sha256: "b".repeat(64) } },
        context,
      ),
    ).toThrow(/frozen_script\.sha256/);
    expect(() =>
      assertDirectorPlanBinding(
        { ...good, frozen_script: { ...good.frozen_script, byte_size: 99999 } },
        context,
      ),
    ).toThrow(/frozen_script\.byte_size/);
    expect(() =>
      assertDirectorPlanBinding({ ...good, style_reference: { style_version: "1.1" } }, context),
    ).toThrow(/style_version/);
  });
});

describe("P9.3B style compliance", () => {
  function proofContext(ruleOverrides = {}, gateOverrides: Record<string, unknown> | null = null) {
    return compileWith({
      styleSnapshot: {
        ...emptySnapshot(),
        editing_grammar: {
          version: 1,
          style_version: "1.0",
          items: [frozenProofRule(ruleOverrides)],
        },
        quality_gates: {
          version: 1,
          style_version: "1.0",
          items: gateOverrides === null ? [] : [frozenProofGate(gateOverrides)],
        },
      },
    });
  }

  it("rejects a FROZEN mandatory visual violation", () => {
    const context = proofContext();
    const plan = manualPlan(context, [
      proofSegment({
        primary_visual: "visual.proof.decorative-broll",
        allowed_visuals: ["visual.proof.decorative-broll"],
      }),
    ]);

    const report = validateDirectorPlanCompliance(plan, context);
    expect(report.violations.length).toBeGreaterThan(0);
    expect(() => assertDirectorPlanCompliant(plan, context)).toThrow(/decorative-broll/);
  });

  it("rejects a FROZEN HARD quality gate violation", () => {
    const context = proofContext({ status: "CANDIDATE" }, {});
    const plan = manualPlan(context, [
      proofSegment({
        primary_visual: "visual.proof.decorative-broll",
        allowed_visuals: ["visual.proof.decorative-broll"],
      }),
    ]);

    // The editing rule is only a candidate here, so the failure must come
    // from the FROZEN HARD quality gate alone.
    const report = validateDirectorPlanCompliance(plan, context);
    expect(report.violations.map((issue) => issue.kind)).toContain("decorative-broll-gated");
    expect(() => assertDirectorPlanCompliant(plan, context)).toThrow(/decorative-broll/);
  });

  it("keeps OBSERVED deviations out of hard failures", () => {
    const context = compileWith({
      styleSnapshot: {
        ...emptySnapshot(),
        editing_grammar: {
          version: 1,
          style_version: "1.0",
          items: [frozenProofRule({ status: "OBSERVED" })],
        },
      },
    });
    const plan = manualPlan(context, [
      proofSegment({
        primary_visual: "visual.proof.decorative-broll",
        allowed_visuals: ["visual.proof.decorative-broll"],
      }),
    ]);

    expect(validateDirectorPlanCompliance(plan, context).violations).toEqual([]);
    expect(() => assertDirectorPlanCompliant(plan, context)).not.toThrow();
  });

  it("keeps CANDIDATE deviations out of hard failures", () => {
    const context = proofContext({ status: "CANDIDATE" });
    const plan = manualPlan(context, [
      proofSegment({
        primary_visual: "visual.proof.decorative-broll",
        allowed_visuals: ["visual.proof.decorative-broll"],
      }),
    ]);

    expect(validateDirectorPlanCompliance(plan, context).violations).toEqual([]);
    expect(() => assertDirectorPlanCompliant(plan, context)).not.toThrow();
  });

  it("keeps approved-advisory deviations out of hard failures", () => {
    const context = proofContext({ status: "CANDIDATE" }, { status: "FROZEN", severity: "ADVISORY" });
    const plan = manualPlan(context, [
      proofSegment({
        primary_visual: "visual.proof.decorative-broll",
        allowed_visuals: ["visual.proof.decorative-broll"],
      }),
    ]);

    expect(validateDirectorPlanCompliance(plan, context).violations).toEqual([]);
    expect(() => assertDirectorPlanCompliant(plan, context)).not.toThrow();
  });

  it("never treats UNSET items as style rules", () => {
    const context = compileWith({
      styleSnapshot: {
        ...emptySnapshot(),
        editing_grammar: {
          version: 1,
          style_version: "1.0",
          items: [frozenProofRule({ status: "UNSET" })],
        },
      },
    });
    const plan = manualPlan(context, [
      proofSegment({
        primary_visual: "visual.proof.decorative-broll",
        allowed_visuals: ["visual.proof.decorative-broll"],
      }),
    ]);

    const report = validateDirectorPlanCompliance(plan, context);
    expect(report.violations).toEqual([]);
    expect(report.notes).toEqual([]);
  });

  it("rejects PROOF decorative B-roll under a FROZEN fixture", () => {
    const context = proofContext({}, {});
    const plan = manualPlan(context, [
      proofSegment({
        primary_visual: "visual.proof.decorative-broll",
        allowed_visuals: ["visual.proof.decorative-broll"],
      }),
    ]);

    expect(() => importManualDirectorPlan(plan, context)).toThrow(/decorative-broll/);
  });

  it("accepts a valid manual/imported plan through the same gate", () => {
    const context = proofContext({}, {});
    const plan = manualPlan(context, [proofSegment()]);

    const imported = importManualDirectorPlan(plan, context);
    expect(imported.segments).toHaveLength(1);
    expect(imported.project_id).toBe("proj-demo-1");
  });
});

describe("P9.3B edit plan integration", () => {
  function baseEditPlan() {
    return {
      version: 1,
      format: "9:16",
      timeline: [
        {
          id: "clip_001",
          source: "raw/camera/talk.mp4",
          source_start_ms: 0,
          source_end_ms: 2000,
          layout: "layout.talking-head",
          caption: false,
        },
        {
          id: "clip_002",
          source: "raw/camera/talk.mp4",
          source_start_ms: 2000,
          source_end_ms: 4000,
          layout: "layout.talking-head",
          caption: false,
        },
        {
          id: "broll_asset_009",
          source_asset_id: "asset_009",
          source_start_ms: 0,
          source_end_ms: 2000,
          layout: "layout.broll",
          caption: false,
        },
      ],
    };
  }

  it("augments one timeline without creating a second", () => {
    const context = compileWith({
      styleSnapshot: {
        ...emptySnapshot(),
        editing_grammar: {
          version: 1,
          style_version: "1.0",
          items: [frozenProofRule()],
        },
      },
    });
    const plan = manualPlan(context, [
      proofSegment({ segment_id: "seg_01", caption_mode: "default" }),
      {
        ...proofSegment({
          segment_id: "seg_02",
          source_range_ms: { start_ms: 2000, end_ms: 4000 },
          caption_mode: "none",
        }),
      },
    ]);

    const result = augmentEditPlanWithDirection(baseEditPlan(), plan, context);

    expect(result.plan.timeline.map((clip) => clip.id)).toEqual(["clip_001", "clip_002"]);
    expect(result.removed_broll_clip_ids).toEqual(["broll_asset_009"]);
    expect(result.plan.timeline[0]?.caption).toBe(true);
    expect(result.plan.timeline[1]?.caption).toBe(false);
    expect(result.caption_updates).toBe(2);
    expect(result.plan.format).toBe("9:16");
  });

  it("leaves the rule-based planner working with no DirectorPlan", () => {
    const sha256 = "c".repeat(64);
    const plan = createRuleBasedEditPlan({
      transcript: {
        source_media_id: `sha256:${sha256}`,
        segments: [
          { id: "seg_001", start_ms: 0, end_ms: 2000, speaker: "spk_0", text: "hello world" },
        ],
      },
      source_media: {
        id: `sha256:${sha256}`,
        sha256,
        byte_size: 10,
        path: "raw/camera/talk.mp4",
        kind: "camera",
      },
      default_layout: "layout.talking-head",
      assets: [],
    });

    expect(plan.timeline).toHaveLength(1);
    expect(plan.timeline[0]).toMatchObject({ id: "seg_001", layout: "layout.talking-head" });
  });
});

describe("P9.3B risk carriage and project store", () => {
  it("carries SCRIPT_VISUAL_RISK without touching the Frozen Script", () => {
    const cwd = mkdtempSync(join(tmpdir(), "creator-pipeline-p93b-test-"));
    temporaryDirectories.push(cwd);
    initializeProject("demo", cwd);
    const frozenBefore = writeProjectFrozenScript("demo", FROZEN_TEXT, cwd);

    const context = compileDirectorContext({
      project: { ...baseProject(), id: readProjectId(cwd) },
      frozenScriptText: FROZEN_TEXT,
      styleSnapshot: emptySnapshot(),
    });
    const plan = manualPlan(
      context,
      [proofSegment()],
      [
        {
          id: "risk_001",
          type: "SCRIPT_VISUAL_RISK",
          script_anchor: { start_line: 2, end_line: 3 },
          reason: "Abstract lines with no evidence carrier.",
          severity: "low",
        },
      ],
    );

    expect(importManualDirectorPlan(plan, context).script_visual_risks).toHaveLength(1);
    writeProjectDirectorPlan("demo", importManualDirectorPlan(plan, context), cwd);

    expect(readFileSync(join(cwd, "workspace", "projects", "demo", "content", "frozen-script.md"), "utf8")).toBe(
      FROZEN_TEXT,
    );
    expect(frozenBefore.byte_size).toBe(Buffer.from(FROZEN_TEXT, "utf8").byteLength);
    const stored = readProjectDirectorPlan("demo", cwd);
    expect(stored?.script_visual_risks).toHaveLength(1);
  });
});

function readProjectId(cwd: string): string {
  const raw = JSON.parse(
    readFileSync(join(cwd, "workspace", "projects", "demo", "project.json"), "utf8"),
  ) as { id: string };
  return raw.id;
}
