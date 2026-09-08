import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadStyleOS } from "../src/brand/style-os.ts";
import { compileDirectorContext } from "../src/director/compile-context.ts";
import {
  applyDirectorPlan,
  importDirectorPlan,
  prepareDirectorJob,
  readDirectorJob,
} from "../src/director/handoff.ts";
import { createRuleBasedEditPlan } from "../src/edit/edit-planner.ts";
import {
  initializeProject,
  readProjectDirectorPlan,
  readProjectEditPlan,
  writeProjectDirectorContext,
  writeProjectDirectorPlan,
  writeProjectEditPlan,
  writeProjectFrozenScript,
} from "../src/project/project-store.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const FROZEN_TEXT = "# Demo\n\nLine two.\nLine three.\n";
const CHANGED_TEXT = "# Demo\n\nLine two changed.\nLine three.\n";

function setupProject() {
  const cwd = mkdtempSync(join(tmpdir(), "creator-pipeline-p93c-test-"));
  temporaryDirectories.push(cwd);
  const project = initializeProject("demo", cwd);
  writeProjectFrozenScript("demo", FROZEN_TEXT, cwd);
  return { cwd, identity: project.identity };
}

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

function frozenProofRule() {
  return {
    id: "editing.proof.real-evidence-first",
    status: "FROZEN",
    applies_to: ["PROOF"],
    rule: "Prefer real evidence over decorative B-roll.",
    allowed_visuals: ["visual.proof.real-demo"],
    forbidden_visuals: ["visual.proof.decorative-broll"],
    why: "Evidence keeps the claim credible.",
  };
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
    reason: "External director fixture.",
    confidence: 0.8,
    ...overrides,
  };
}

function planForContext(context: { project_slug: string; project_id: string; frozen_script: object; style_version: string }, segments: unknown[]) {
  return {
    version: 1,
    project_slug: context.project_slug,
    project_id: context.project_id,
    frozen_script: { ...context.frozen_script },
    style_reference: { style_version: context.style_version },
    segments,
  };
}

function writeExternalPlan(cwd: string, name: string, plan: unknown): string {
  const planPath = join(cwd, name);
  writeFileSync(planPath, JSON.stringify(plan, null, 2), "utf8");
  return planPath;
}

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
    ],
  };
}

describe("P9.3C prepare director job", () => {
  it("writes a structured context file and job envelope", () => {
    const { cwd } = setupProject();
    const { context, job } = prepareDirectorJob("demo", cwd);

    const contextPath = join(cwd, "workspace", "projects", "demo", "plans", "director-context.json");
    const jobPath = join(cwd, "workspace", "projects", "demo", "plans", "director-job.json");
    expect(JSON.parse(readFileSync(contextPath, "utf8")).version).toBe(1);
    expect(job.context_path).toBe("plans/director-context.json");
    expect(job.expected_output_contract).toEqual({ kind: "director-plan", version: 1 });
    expect(job.expected_output_path).toBe("plans/director-plan.json");
    expect(context.script_text).toBe(FROZEN_TEXT);
  });

  it("binds the real project and frozen identities", () => {
    const { cwd, identity } = setupProject();
    const { context, job } = prepareDirectorJob("demo", cwd);

    expect(context.project_slug).toBe("demo");
    expect(context.project_id).toBe(identity.id);
    expect(job.project_id).toBe(identity.id);
    const bytes = Buffer.from(FROZEN_TEXT, "utf8");
    expect(context.frozen_script.sha256).toHaveLength(64);
    expect(context.frozen_script.byte_size).toBe(bytes.byteLength);
    expect(job.frozen_script.sha256).toBe(context.frozen_script.sha256);
  });

  it("is deterministic across repeated prepares", () => {
    const { cwd } = setupProject();
    const first = prepareDirectorJob("demo", cwd);
    const second = prepareDirectorJob("demo", cwd);

    expect(first.context).toEqual(second.context);
  });

  it("requires a frozen script before preparing", () => {
    const cwd = mkdtempSync(join(tmpdir(), "creator-pipeline-p93c-test-"));
    temporaryDirectories.push(cwd);
    initializeProject("demo", cwd);

    expect(() => prepareDirectorJob("demo", cwd)).toThrow(/frozen-script/);
  });
});

describe("P9.3C import director plan", () => {
  it("imports an externally produced valid plan", () => {
    const { cwd } = setupProject();
    const { context } = prepareDirectorJob("demo", cwd);

    const planPath = writeExternalPlan(cwd, "external-plan.json", planForContext(context, [proofSegment()]));
    const plan = importDirectorPlan("demo", planPath, cwd);

    expect(plan.segments).toHaveLength(1);
    expect(readProjectDirectorPlan("demo", cwd)?.segments).toHaveLength(1);
  });

  it("rejects an invalid schema without writing anything", () => {
    const { cwd } = setupProject();
    prepareDirectorJob("demo", cwd);

    const planPath = writeExternalPlan(cwd, "bad-plan.json", { version: 1, nonsense: true });
    expect(() => importDirectorPlan("demo", planPath, cwd)).toThrow();
    expect(readProjectDirectorPlan("demo", cwd)).toBeUndefined();
  });

  it("rejects project, frozen, and style mismatches", () => {
    const { cwd } = setupProject();
    const { context } = prepareDirectorJob("demo", cwd);
    const good = planForContext(context, [proofSegment()]);

    expect(() =>
      importDirectorPlan("demo", writeExternalPlan(cwd, "p1.json", { ...good, project_id: "proj-other" }), cwd),
    ).toThrow(/project_id/);
    expect(() =>
      importDirectorPlan(
        "demo",
        writeExternalPlan(cwd, "p2.json", {
          ...good,
          frozen_script: { ...good.frozen_script, sha256: "b".repeat(64) },
        }),
        cwd,
      ),
    ).toThrow(/sha256|frozen/i);
    expect(() =>
      importDirectorPlan(
        "demo",
        writeExternalPlan(cwd, "p3.json", { ...good, style_reference: { style_version: "1.1" } }),
        cwd,
      ),
    ).toThrow(/style_version/);
    expect(readProjectDirectorPlan("demo", cwd)).toBeUndefined();
  });

  it("rejects a hard style violation", () => {
    const { cwd, identity } = setupProject();
    const snapshot = {
      ...emptySnapshot(),
      editing_grammar: { version: 1, style_version: "1.0", items: [frozenProofRule()] },
    };
    const context = compileDirectorContext({
      project: identity,
      frozenScriptText: FROZEN_TEXT,
      styleSnapshot: snapshot,
    });
    writeProjectDirectorContext("demo", context, cwd);

    const violating = planForContext(context, [
      proofSegment({
        primary_visual: "visual.proof.decorative-broll",
        allowed_visuals: ["visual.proof.decorative-broll"],
      }),
    ]);
    expect(() =>
      importDirectorPlan("demo", writeExternalPlan(cwd, "violating.json", violating), cwd),
    ).toThrow(/decorative-broll/);
    expect(readProjectDirectorPlan("demo", cwd)).toBeUndefined();
  });

  it("leaves a previously imported valid plan untouched after a rejection", () => {
    const { cwd } = setupProject();
    const { context } = prepareDirectorJob("demo", cwd);

    importDirectorPlan("demo", writeExternalPlan(cwd, "good.json", planForContext(context, [proofSegment()])), cwd);
    expect(() =>
      importDirectorPlan("demo", writeExternalPlan(cwd, "bad.json", { version: 1 }), cwd),
    ).toThrow();
    expect(readProjectDirectorPlan("demo", cwd)?.segments).toHaveLength(1);
  });

  it("treats two external directors through the identical path", () => {
    const { cwd } = setupProject();
    const { context } = prepareDirectorJob("demo", cwd);

    const fromA = planForContext(context, [proofSegment({ segment_id: "seg_a" })]);
    const fromB = planForContext(context, [
      proofSegment({ segment_id: "seg_b", caption_mode: "none" }),
    ]);
    importDirectorPlan("demo", writeExternalPlan(cwd, "external-director-a.json", fromA), cwd);
    expect(readProjectDirectorPlan("demo", cwd)?.segments[0]?.segment_id).toBe("seg_a");
    importDirectorPlan("demo", writeExternalPlan(cwd, "external-director-b.json", fromB), cwd);

    const stored = readProjectDirectorPlan("demo", cwd);
    expect(stored?.segments[0]?.segment_id).toBe("seg_b");
    expect(JSON.stringify(stored)).not.toContain("external-director");
  });
});

describe("P9.3C apply director plan", () => {
  function prepareWithEditPlan(cwd: string) {
    const { context } = prepareDirectorJob("demo", cwd);
    const plan = planForContext(context, [
      proofSegment({ caption_mode: "default" }),
      {
        ...proofSegment({
          segment_id: "seg_02",
          source_range_ms: { start_ms: 2000, end_ms: 4000 },
          caption_mode: "none",
        }),
      },
    ]);
    importDirectorPlan("demo", writeExternalPlan(cwd, "plan.json", plan), cwd);
    writeProjectEditPlan("demo", baseEditPlan(), cwd);
    return context;
  }

  it("applies a valid handoff into exactly one EditPlan", () => {
    const { cwd } = setupProject();
    prepareWithEditPlan(cwd);

    const result = applyDirectorPlan("demo", cwd);

    expect(result.plan.timeline.map((clip) => clip.id)).toEqual(["clip_001", "clip_002"]);
    expect(result.plan.timeline[0]?.caption).toBe(true);
    const stored = readProjectEditPlan("demo", cwd);
    expect(stored?.timeline).toHaveLength(2);
  });

  it("rejects a stale DirectorPlan", () => {
    const { cwd } = setupProject();
    prepareWithEditPlan(cwd);

    writeProjectFrozenScript("demo", CHANGED_TEXT, cwd);
    prepareDirectorJob("demo", cwd);

    expect(() => applyDirectorPlan("demo", cwd)).toThrow(/stale/);
  });

  it("rejects a stale DirectorContext", () => {
    const { cwd } = setupProject();
    const context = prepareWithEditPlan(cwd);

    const changed = writeProjectFrozenScript("demo", CHANGED_TEXT, cwd);
    writeProjectDirectorPlan(
      "demo",
      {
        ...planForContext(context, [proofSegment()]),
        frozen_script: {
          path: "content/frozen-script.md",
          sha256: changed.sha256,
          byte_size: changed.byte_size,
        },
      },
      cwd,
    );

    expect(() => applyDirectorPlan("demo", cwd)).toThrow(/stale/);
  });

  it("requires an existing EditPlan instead of inventing a timeline", () => {
    const { cwd } = setupProject();
    const { context } = prepareDirectorJob("demo", cwd);
    importDirectorPlan("demo", writeExternalPlan(cwd, "plan.json", planForContext(context, [proofSegment()])), cwd);

    expect(() => applyDirectorPlan("demo", cwd)).toThrow(/EditPlan/);
  });
});

describe("P9.3C fallback compatibility", () => {
  it("keeps the classic rule-based path working with no director artifacts", () => {
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
  });
});
