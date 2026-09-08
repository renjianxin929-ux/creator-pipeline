import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  isDirectorPlanStale,
  parseDirectorPlan,
  semanticRoleValues,
} from "../src/contracts/index.ts";
import { sha256Bytes } from "../src/project/file-hash.ts";
import {
  initializeProject,
  isProjectDirectorPlanStale,
  readProjectDirectorDecisions,
  readProjectDirectorPlan,
  readProjectFrozenScript,
  readProjectFrozenScriptIdentity,
  writeProjectDirectorDecisions,
  writeProjectDirectorPlan,
  writeProjectFrozenScript,
} from "../src/project/project-store.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const FROZEN_SHA = "a".repeat(64);

function baseSegment() {
  return {
    segment_id: "seg_01",
    script_anchor: { start_line: 1, end_line: 3 },
    source_range_ms: { start_ms: 0, end_ms: 4_000 },
    semantic_role: "HOOK",
    primary_visual: "visual.hook.talking-head",
    allowed_visuals: ["visual.hook.talking-head", "visual.hook.title-card"],
    forbidden_visuals: ["visual.hook.decorative-broll"],
    caption_mode: "default",
    motion_id: "motion.keyword-pop",
    director_intent: "open on the speaker to establish the claim",
    reason: "the hook is spoken directly to the viewer",
    confidence: 0.9,
  };
}

function basePlan() {
  return {
    version: 1,
    project_slug: "demo",
    frozen_script: {
      path: "content/frozen-script.md",
      sha256: FROZEN_SHA,
      byte_size: 128,
    },
    style_reference: { style_version: "1.0" },
    segments: [baseSegment()],
  };
}

describe("P9.1 director plan contract", () => {
  it("accepts a legal director plan covering every semantic role", () => {
    for (const semantic_role of semanticRoleValues) {
      expect(semanticRoleValues).toContain(semantic_role);
    }
    expect(semanticRoleValues).toHaveLength(10);

    const plan = parseDirectorPlan({
      ...basePlan(),
      segments: semanticRoleValues.map((semantic_role, index) => ({
        ...baseSegment(),
        segment_id: `seg_${String(index + 1).padStart(2, "0")}`,
        script_anchor: { start_line: index + 1, end_line: index + 1 },
        semantic_role,
      })),
    });
    expect(plan.segments).toHaveLength(10);
  });

  it("rejects an unconstrained semantic role", () => {
    expect(() =>
      parseDirectorPlan({
        ...basePlan(),
        segments: [{ ...baseSegment(), semantic_role: "MONTAGE" }],
      }),
    ).toThrow();
  });

  it("rejects illegal segment ids, ranges, and visual bindings", () => {
    // inverted script anchor
    expect(() =>
      parseDirectorPlan({
        ...basePlan(),
        segments: [{ ...baseSegment(), script_anchor: { start_line: 5, end_line: 2 } }],
      }),
    ).toThrow();

    // inverted time range
    expect(() =>
      parseDirectorPlan({
        ...basePlan(),
        segments: [{ ...baseSegment(), source_range_ms: { start_ms: 4_000, end_ms: 4_000 } }],
      }),
    ).toThrow();

    // duplicate segment ids
    expect(() =>
      parseDirectorPlan({
        ...basePlan(),
        segments: [baseSegment(), baseSegment()],
      }),
    ).toThrow();

    // primary visual outside the allowed set
    expect(() =>
      parseDirectorPlan({
        ...basePlan(),
        segments: [{ ...baseSegment(), primary_visual: "visual.hook.cutaway" }],
      }),
    ).toThrow();

    // allowed/forbidden overlap
    expect(() =>
      parseDirectorPlan({
        ...basePlan(),
        segments: [
          {
            ...baseSegment(),
            forbidden_visuals: ["visual.hook.talking-head"],
          },
        ],
      }),
    ).toThrow();

    // renderer-specific visual ids are not stable contracts
    expect(() =>
      parseDirectorPlan({
        ...basePlan(),
        segments: [{ ...baseSegment(), primary_visual: "hyperframes_zoom_v2", allowed_visuals: ["hyperframes_zoom_v2"] }],
      }),
    ).toThrow();

    // vendor-named motion ids are rejected
    expect(() =>
      parseDirectorPlan({
        ...basePlan(),
        segments: [{ ...baseSegment(), motion_id: "motion.claude-proof-animation" }],
      }),
    ).toThrow();

    // emphasis caption mode requires real emphasis text
    expect(() =>
      parseDirectorPlan({
        ...basePlan(),
        segments: [{ ...baseSegment(), caption_mode: "emphasis" }],
      }),
    ).toThrow();
  });

  it("rejects missing required frozen-script and style references", () => {
    const { frozen_script: _frozen, ...withoutFrozen } = basePlan();
    expect(() => parseDirectorPlan(withoutFrozen)).toThrow();

    const { style_reference: _style, ...withoutStyle } = basePlan();
    expect(() => parseDirectorPlan(withoutStyle)).toThrow();

    expect(() =>
      parseDirectorPlan({ ...basePlan(), segments: [] }),
    ).toThrow();
  });

  it("keeps a plan valid while frozen-script bytes are unchanged", () => {
    const plan = parseDirectorPlan(basePlan());
    expect(isDirectorPlanStale(plan, FROZEN_SHA)).toBe(false);
  });

  it("marks a plan deterministically stale once frozen-script bytes change", () => {
    const plan = parseDirectorPlan(basePlan());
    const changedSha = "b".repeat(64);

    expect(isDirectorPlanStale(plan, changedSha)).toBe(true);
    // determinism: same inputs always give the same verdict
    expect(isDirectorPlanStale(plan, changedSha)).toBe(isDirectorPlanStale(plan, changedSha));
    expect(isDirectorPlanStale(plan, FROZEN_SHA)).toBe(false);
  });

  it("derives frozen-script identity from bytes, not filenames", () => {
    const first = sha256Bytes(Buffer.from("# frozen\n", "utf8"));
    const second = sha256Bytes(Buffer.from("# frozen\n", "utf8"));
    const changed = sha256Bytes(Buffer.from("# frozen changed\n", "utf8"));

    expect(first).toBe(second);
    expect(first).not.toBe(changed);
  });
});

describe("P9.1 director project store", () => {
  it("roundtrips frozen script bytes and the director plan", () => {
    const cwd = createTemporaryDirectory();
    initializeProject("demo", cwd);

    expect(readProjectFrozenScript("demo", cwd)).toBeUndefined();
    expect(readProjectDirectorPlan("demo", cwd)).toBeUndefined();

    const identity = writeProjectFrozenScript("demo", "# frozen\n\nLine one.\n", cwd);
    expect(readProjectFrozenScript("demo", cwd)).toBe("# frozen\n\nLine one.\n");
    expect(readProjectFrozenScriptIdentity("demo", cwd)).toEqual(identity);

    const plan = parseDirectorPlan({
      ...basePlan(),
      frozen_script: {
        path: "content/frozen-script.md",
        sha256: identity.sha256,
        byte_size: identity.byte_size,
      },
    });
    writeProjectDirectorPlan("demo", plan, cwd);
    expect(readProjectDirectorPlan("demo", cwd)).toEqual(plan);
    expect(isProjectDirectorPlanStale("demo", cwd)).toBe(false);

    // any byte change invalidates the previously valid plan
    writeProjectFrozenScript("demo", "# frozen\n\nLine one changed.\n", cwd);
    expect(isProjectDirectorPlanStale("demo", cwd)).toBe(true);
  });

  it("rejects cross-project identity mismatches", () => {
    const cwd = createTemporaryDirectory();
    initializeProject("demo", cwd);
    initializeProject("other", cwd);

    expect(() => writeProjectDirectorPlan("other", parseDirectorPlan(basePlan()), cwd)).toThrow(
      "project_slug must match",
    );

    // a plan file planted under the wrong project slug is rejected on read
    writeFileSync(
      join(cwd, "workspace", "projects", "other", "plans", "director-plan.json"),
      JSON.stringify(parseDirectorPlan({ ...basePlan(), project_slug: "demo" })),
      "utf8",
    );
    expect(() => readProjectDirectorPlan("other", cwd)).toThrow("Invalid director plan");

    expect(() =>
      writeProjectDirectorDecisions(
        "other",
        { version: 1, project_slug: "demo", director_frozen_script_sha256: FROZEN_SHA, decisions: [] },
        cwd,
      ),
    ).toThrow("project_slug must match");
  });

  it("rejects invalid JSON and invalid schemas instead of accepting them silently", () => {
    const cwd = createTemporaryDirectory();
    initializeProject("demo", cwd);

    writeFileSync(
      join(cwd, "workspace", "projects", "demo", "plans", "director-plan.json"),
      "{not-json",
      "utf8",
    );
    expect(() => readProjectDirectorPlan("demo", cwd)).toThrow("Unable to read valid director plan");

    writeFileSync(
      join(cwd, "workspace", "projects", "demo", "plans", "director-plan.json"),
      JSON.stringify({ ...basePlan(), segments: [{ ...baseSegment(), semantic_role: "VIBE" }] }),
      "utf8",
    );
    expect(() => readProjectDirectorPlan("demo", cwd)).toThrow("Invalid director plan");
  });

  it("keeps a minimal decisions envelope without building the P9.4 review loop", () => {
    const cwd = createTemporaryDirectory();
    initializeProject("demo", cwd);

    expect(readProjectDirectorDecisions("demo", cwd)).toBeUndefined();
    writeProjectDirectorDecisions(
      "demo",
      { version: 1, project_slug: "demo", director_frozen_script_sha256: FROZEN_SHA, decisions: [] },
      cwd,
    );
    expect(readProjectDirectorDecisions("demo", cwd)).toEqual({
      version: 1,
      project_slug: "demo",
      director_frozen_script_sha256: FROZEN_SHA,
      decisions: [],
    });

    const raw = JSON.parse(
      readFileSync(join(cwd, "workspace", "projects", "demo", "review", "director-decisions.json"), "utf8"),
    );
    expect(raw.project_slug).toBe("demo");
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-p91-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
