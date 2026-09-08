import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  readProjectDirectorPlan,
  readProjectFrozenScript,
  readProjectFrozenScriptIdentity,
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
const TEST_PROJECT_ID = "test-project-id";

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

function basePlan(projectId = TEST_PROJECT_ID) {
  return {
    version: 1,
    project_slug: "demo",
    project_id: projectId,
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

  it("rejects missing required project, frozen-script, and style references", () => {
    const { project_id: _id, ...withoutProjectId } = basePlan();
    expect(() => parseDirectorPlan(withoutProjectId)).toThrow();

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
    const project = initializeProject("demo", cwd);

    expect(readProjectFrozenScript("demo", cwd)).toBeUndefined();
    expect(readProjectDirectorPlan("demo", cwd)).toBeUndefined();

    const identity = writeProjectFrozenScript("demo", "# frozen\n\nLine one.\n", cwd);
    expect(readProjectFrozenScript("demo", cwd)).toBe("# frozen\n\nLine one.\n");
    expect(readProjectFrozenScriptIdentity("demo", cwd)).toEqual(identity);

    const plan = parseDirectorPlan({
      ...basePlan(project.identity.id),
      frozen_script: {
        path: "content/frozen-script.md",
        sha256: identity.sha256,
        byte_size: identity.byte_size,
      },
    });
    writeProjectDirectorPlan("demo", plan, cwd);
    expect(readProjectDirectorPlan("demo", cwd)).toEqual(plan);
    expect(isProjectDirectorPlanStale("demo", cwd)).toBe(false);

    // any byte change invalidates the previously valid plan on read
    writeProjectFrozenScript("demo", "# frozen\n\nLine one changed.\n", cwd);
    expect(isProjectDirectorPlanStale("demo", cwd)).toBe(true);
  });

  it("rejects a foreign project id even when the slug matches", () => {
    const cwd = createTemporaryDirectory();
    const project = initializeProject("demo", cwd);
    const frozen = writeProjectFrozenScript("demo", "# frozen\n", cwd);

    const foreignPlan = parseDirectorPlan({
      ...basePlan("foreign-project-id"),
      frozen_script: {
        path: "content/frozen-script.md",
        sha256: frozen.sha256,
        byte_size: frozen.byte_size,
      },
    });
    expect(foreignPlan.project_slug).toBe("demo");
    expect(project.identity.id).not.toBe("foreign-project-id");

    // write rejects the foreign identity
    expect(() => writeProjectDirectorPlan("demo", foreignPlan, cwd)).toThrow(
      "project_id must match",
    );

    // a foreign plan file planted under the same slug is rejected on read
    writeFileSync(
      join(cwd, "workspace", "projects", "demo", "plans", "director-plan.json"),
      JSON.stringify(foreignPlan),
      "utf8",
    );
    expect(() => readProjectDirectorPlan("demo", cwd)).toThrow("Invalid director plan");
  });

  it("rejects cross-project slug mismatches", () => {
    const cwd = createTemporaryDirectory();
    initializeProject("demo", cwd);
    const other = initializeProject("other", cwd);
    writeProjectFrozenScript("other", "# frozen\n", cwd);

    expect(() =>
      writeProjectDirectorPlan("other", parseDirectorPlan(basePlan(other.identity.id)), cwd),
    ).toThrow("project_slug must match");

    // a plan file planted under the wrong project slug is rejected on read
    writeFileSync(
      join(cwd, "workspace", "projects", "other", "plans", "director-plan.json"),
      JSON.stringify(parseDirectorPlan({ ...basePlan(other.identity.id), project_slug: "demo" })),
      "utf8",
    );
    expect(() => readProjectDirectorPlan("other", cwd)).toThrow("Invalid director plan");
  });

  it("rejects stale frozen-script references at write time", () => {
    const cwd = createTemporaryDirectory();
    const project = initializeProject("demo", cwd);
    const frozen = writeProjectFrozenScript("demo", "# frozen\n\nLine one.\n", cwd);

    const matching = () =>
      parseDirectorPlan({
        ...basePlan(project.identity.id),
        frozen_script: {
          path: "content/frozen-script.md",
          sha256: frozen.sha256,
          byte_size: frozen.byte_size,
        },
      });

    // current script is SHA A, plan references SHA B
    expect(() =>
      writeProjectDirectorPlan(
        "demo",
        {
          ...matching(),
          frozen_script: {
            path: "content/frozen-script.md",
            sha256: "b".repeat(64),
            byte_size: frozen.byte_size,
          },
        },
        cwd,
      ),
    ).toThrow("frozen-script identity does not match");

    // SHA correct but byte_size wrong
    expect(() =>
      writeProjectDirectorPlan(
        "demo",
        {
          ...matching(),
          frozen_script: {
            path: "content/frozen-script.md",
            sha256: frozen.sha256,
            byte_size: frozen.byte_size + 1,
          },
        },
        cwd,
      ),
    ).toThrow("frozen-script identity does not match");

    // matching identity writes pass and rejected writes left nothing behind
    writeProjectDirectorPlan("demo", matching(), cwd);
    expect(readProjectDirectorPlan("demo", cwd)).toEqual(matching());
  });

  it("requires an existing frozen script at write time", () => {
    const cwd = createTemporaryDirectory();
    const project = initializeProject("demo", cwd);

    expect(() =>
      writeProjectDirectorPlan("demo", parseDirectorPlan(basePlan(project.identity.id)), cwd),
    ).toThrow("requires an existing frozen script");
  });

  it("rejects invalid JSON and invalid schemas instead of accepting them silently", () => {
    const cwd = createTemporaryDirectory();
    const project = initializeProject("demo", cwd);

    writeFileSync(
      join(cwd, "workspace", "projects", "demo", "plans", "director-plan.json"),
      "{not-json",
      "utf8",
    );
    expect(() => readProjectDirectorPlan("demo", cwd)).toThrow("Unable to read valid director plan");

    writeFileSync(
      join(cwd, "workspace", "projects", "demo", "plans", "director-plan.json"),
      JSON.stringify({
        ...basePlan(project.identity.id),
        segments: [{ ...baseSegment(), semantic_role: "VIBE" }],
      }),
      "utf8",
    );
    expect(() => readProjectDirectorPlan("demo", cwd)).toThrow("Invalid director plan");
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-p91-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
