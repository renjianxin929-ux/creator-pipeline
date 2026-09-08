import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { prepareDirectorJob } from "../src/director/handoff.ts";
import {
  initializeProject,
  readProjectDirectorDecisions,
  writeProjectDirectorPlan,
  writeProjectEditPlan,
  writeProjectFrozenScript,
} from "../src/project/project-store.ts";
import {
  importFounderReview,
  prepareFounderReview,
  readFounderReviewContext,
} from "../src/review/founder-review.ts";

const temporaryDirectories: string[] = [];
const cliPath = resolve(process.cwd(), "dist", "cli", "creator.js");
const FROZEN_TEXT = "# Demo\n\nLine two.\nLine three.\n";
const CHANGED_TEXT = "# Demo\n\nLine two changed.\nLine three.\n";

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function setupReviewableProject(segmentCount: 1 | 2 = 2) {
  const cwd = mkdtempSync(join(tmpdir(), "creator-pipeline-p94b-test-"));
  temporaryDirectories.push(cwd);
  const project = initializeProject("demo", cwd);
  writeProjectFrozenScript("demo", FROZEN_TEXT, cwd);
  const { context } = prepareDirectorJob("demo", cwd);
  const plan = {
    version: 1,
    project_slug: context.project_slug,
    project_id: context.project_id,
    frozen_script: { ...context.frozen_script },
    style_reference: { style_version: context.style_version },
    segments: segmentCount === 1 ? [segmentOne()] : [segmentOne(), segmentTwo()],
  };
  writeProjectDirectorPlan("demo", plan, cwd);
  writeProjectEditPlan("demo", baseEditPlan(), cwd);
  writeFileSync(join(cwd, "workspace", "projects", "demo", "render", "preview.mp4"), "preview-bytes", "utf8");
  return { cwd, identity: project.identity, plan, context };
}

function segmentOne() {
  return {
    segment_id: "seg_01",
    script_anchor: { start_line: 1, end_line: 2 },
    semantic_role: "CLAIM",
    primary_visual: "visual.claim.talking-head",
    allowed_visuals: ["visual.claim.talking-head", "visual.claim.decorative-broll"],
    caption_mode: "default",
    reason: "claim establishment",
    confidence: 0.8,
  };
}

function segmentTwo() {
  return {
    segment_id: "seg_02",
    script_anchor: { start_line: 3, end_line: 3 },
    semantic_role: "HOOK",
    primary_visual: "visual.hook.talking-head",
    allowed_visuals: ["visual.hook.talking-head"],
    caption_mode: "default",
    reason: "open on speaker",
    confidence: 0.7,
  };
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
    ],
  };
}

function captureFromContext(
  reviewContext: NonNullable<ReturnType<typeof readFounderReviewContext>>,
  decisions: unknown[],
  reviewId = "review_01",
) {
  return {
    version: 1,
    project_slug: reviewContext.project_slug,
    project_id: reviewContext.project_id,
    review_id: reviewId,
    director_plan_identity: reviewContext.director_plan_identity,
    preview_reference: reviewContext.preview_reference,
    decisions,
  };
}

function writeCapture(cwd: string, name: string, payload: unknown): string {
  const path = join(cwd, name);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return path;
}

function acceptSeg01(proposal = segmentOne()) {
  return {
    decision_id: "decision_accept_01",
    segment_id: "seg_01",
    proposal,
    action: "ACCEPT",
    reuse_scope: "PROJECT_LOCAL",
  };
}

describe("P9.4B founder review preparation", () => {
  it("builds a review context from the current DirectorPlan and Preview", () => {
    const { cwd, identity } = setupReviewableProject();
    const context = prepareFounderReview("demo", cwd);

    expect(context.project_slug).toBe("demo");
    expect(context.project_id).toBe(identity.id);
    expect(context.preview_reference.preview_path).toBe("render/preview.mp4");
    expect(context.preview_reference.preview_sha256).toHaveLength(64);
    expect(context.preview_reference.edit_plan_sha256).toHaveLength(64);
    expect(context.director_plan_identity.director_plan_sha256).toHaveLength(64);
    expect(context.available_segment_ids).toEqual(["seg_01", "seg_02"]);
    expect(context.expected_input_path).toBe("review/director-review-input.json");
    expect(context).not.toHaveProperty("decisions");
    expect(context).not.toHaveProperty("reviews");
    expect(JSON.stringify(context)).not.toContain("ACCEPT");
  });

  it("is deterministic across repeated prepares", () => {
    const { cwd } = setupReviewableProject();
    const first = prepareFounderReview("demo", cwd);
    const second = prepareFounderReview("demo", cwd);
    expect(first).toEqual(second);
    expect(readFounderReviewContext("demo", cwd)).toEqual(first);
  });

  it("rejects a missing preview", () => {
    const { cwd } = setupReviewableProject();
    rmSync(join(cwd, "workspace", "projects", "demo", "render", "preview.mp4"));
    expect(() => prepareFounderReview("demo", cwd)).toThrow(/Preview does not exist/);
  });

  it("rejects a stale DirectorPlan", () => {
    const { cwd } = setupReviewableProject();
    writeProjectFrozenScript("demo", CHANGED_TEXT, cwd);
    prepareDirectorJob("demo", cwd);
    expect(() => prepareFounderReview("demo", cwd)).toThrow(/DirectorPlan .* stale/);
  });

  it("rejects a stale DirectorContext", () => {
    const { cwd, plan } = setupReviewableProject();
    writeProjectFrozenScript("demo", CHANGED_TEXT, cwd);
    writeProjectDirectorPlan(
      "demo",
      {
        ...plan,
        frozen_script: {
          path: "content/frozen-script.md",
          sha256: writeProjectFrozenScript("demo", CHANGED_TEXT, cwd).sha256,
          byte_size: Buffer.from(CHANGED_TEXT, "utf8").byteLength,
        },
      },
      cwd,
    );
    expect(() => prepareFounderReview("demo", cwd)).toThrow(/DirectorContext .* stale/);
  });
});

describe("P9.4B founder review capture", () => {
  it("imports a valid partial review without auto-ACCEPT of other segments", () => {
    const { cwd, plan } = setupReviewableProject();
    const context = prepareFounderReview("demo", cwd);
    const path = writeCapture(cwd, "review-decisions.json", captureFromContext(context, [acceptSeg01()]));

    const dataset = importFounderReview("demo", path, cwd);
    expect(dataset.reviews).toHaveLength(1);
    expect(dataset.reviews[0]?.decisions).toHaveLength(1);
    expect(dataset.reviews[0]?.decisions[0]?.segment_id).toBe("seg_01");
    expect(dataset.reviews[0]?.decisions.map((decision) => decision.action)).toEqual(["ACCEPT"]);
    expect(plan.segments.map((segment) => segment.segment_id)).toEqual(["seg_01", "seg_02"]);
    expect(dataset.reviews[0]?.decisions.some((decision) => decision.segment_id === "seg_02")).toBe(false);
  });

  it("rejects a segment that is not in the reviewed plan", () => {
    const { cwd } = setupReviewableProject();
    const context = prepareFounderReview("demo", cwd);
    const path = writeCapture(
      cwd,
      "bad-segment.json",
      captureFromContext(context, [
        {
          ...acceptSeg01(),
          segment_id: "seg_99",
          proposal: { ...segmentOne(), segment_id: "seg_99" },
        },
      ]),
    );
    expect(() => importFounderReview("demo", path, cwd)).toThrow(/not in the reviewed DirectorPlan/);
    expect(readProjectDirectorDecisions("demo", cwd)).toBeUndefined();
  });

  it("rejects a proposal that differs from the reviewed segment", () => {
    const { cwd } = setupReviewableProject();
    const context = prepareFounderReview("demo", cwd);
    const path = writeCapture(
      cwd,
      "bad-proposal.json",
      captureFromContext(context, [
        acceptSeg01({
          ...segmentOne(),
          primary_visual: "visual.claim.decorative-broll",
        }),
      ]),
    );
    expect(() => importFounderReview("demo", path, cwd)).toThrow(/proposal does not match/);
    expect(readProjectDirectorDecisions("demo", cwd)).toBeUndefined();
  });

  it("rejects an invalid CHANGE and leaves the previous dataset untouched", () => {
    const { cwd } = setupReviewableProject();
    const context = prepareFounderReview("demo", cwd);
    const firstPath = writeCapture(cwd, "first.json", captureFromContext(context, [acceptSeg01()]));
    importFounderReview("demo", firstPath, cwd);
    const before = readFileSync(
      join(cwd, "workspace", "projects", "demo", "review", "director-decisions.json"),
      "utf8",
    );

    const badPath = writeCapture(
      cwd,
      "bad-change.json",
      captureFromContext(
        context,
        [
          {
            decision_id: "decision_change_01",
            segment_id: "seg_01",
            proposal: segmentOne(),
            action: "CHANGE",
            reason: "broken patch",
            replacement: { primary_visual: { op: "replace", value: "visual.claim.screenshot" } },
            reuse_scope: "PROJECT_LOCAL",
          },
        ],
        "review_02",
      ),
    );
    expect(() => importFounderReview("demo", badPath, cwd)).toThrow();
    expect(
      readFileSync(join(cwd, "workspace", "projects", "demo", "review", "director-decisions.json"), "utf8"),
    ).toBe(before);
  });

  it("appends multiple review sessions", () => {
    const { cwd } = setupReviewableProject();
    const context = prepareFounderReview("demo", cwd);
    importFounderReview("demo", writeCapture(cwd, "round-1.json", captureFromContext(context, [acceptSeg01()])), cwd);
    importFounderReview(
      "demo",
      writeCapture(
        cwd,
        "round-2.json",
        captureFromContext(
          context,
          [
            {
              decision_id: "decision_reject_02",
              segment_id: "seg_02",
              proposal: segmentTwo(),
              action: "REJECT",
              reason: "hook should stay quieter",
              reuse_scope: "PROJECT_LOCAL",
            },
          ],
          "review_02",
        ),
      ),
      cwd,
    );
    const dataset = readProjectDirectorDecisions("demo", cwd);
    expect(dataset?.reviews.map((review) => review.review_id)).toEqual(["review_01", "review_02"]);
  });

  it("does not let an external capture overwrite the official dataset path", () => {
    const { cwd } = setupReviewableProject();
    const context = prepareFounderReview("demo", cwd);
    const official = join(cwd, "workspace", "projects", "demo", "review", "director-decisions.json");
    writeFileSync(official, `${JSON.stringify(captureFromContext(context, [acceptSeg01()]), null, 2)}\n`, "utf8");
    expect(() => importFounderReview("demo", official, cwd)).toThrow(/must not target/);
  });
});

describe("P9.4B founder review CLI", () => {
  it("prepares and imports a review through the CLI", () => {
    const cwd = mkdtempSync(join(tmpdir(), "creator-pipeline-p94b-cli-"));
    temporaryDirectories.push(cwd);
    writeFileSync(join(cwd, "creator.config.json"), JSON.stringify({ workspace: "./temporary-workspace" }), "utf8");
    expect(runCreator(cwd, ["init", "demo"]).status).toBe(0);

    const projectDirectory = join(cwd, "temporary-workspace", "projects", "demo");
    writeFileSync(join(projectDirectory, "content", "frozen-script.md"), FROZEN_TEXT, "utf8");
    expect(runCreator(cwd, ["director", "prepare", "demo"]).status).toBe(0);

    const storedContext = JSON.parse(readFileSync(join(projectDirectory, "plans", "director-context.json"), "utf8")) as {
      project_slug: string;
      project_id: string;
      frozen_script: { sha256: string; byte_size: number };
      style_version: string;
    };
    writeFileSync(
      join(projectDirectory, "plans", "director-plan.json"),
      `${JSON.stringify(
        {
          version: 1,
          project_slug: storedContext.project_slug,
          project_id: storedContext.project_id,
          frozen_script: {
            path: "content/frozen-script.md",
            sha256: storedContext.frozen_script.sha256,
            byte_size: storedContext.frozen_script.byte_size,
          },
          style_reference: { style_version: storedContext.style_version },
          segments: [segmentOne()],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    writeFileSync(join(projectDirectory, "plans", "edit-plan.json"), `${JSON.stringify(baseEditPlan(), null, 2)}\n`, "utf8");
    writeFileSync(join(projectDirectory, "render", "preview.mp4"), "preview-bytes", "utf8");

    const prepared = runCreator(cwd, ["director", "review", "prepare", "demo"]);
    expect(prepared.status).toBe(0);
    expect(prepared.stdout).toContain("DIRECTOR_REVIEW_CONTEXT_READY demo");

    const reviewContext = JSON.parse(
      readFileSync(join(projectDirectory, "review", "director-review-context.json"), "utf8"),
    );
    const capturePath = join(cwd, "review-decisions.json");
    writeFileSync(capturePath, `${JSON.stringify(captureFromContext(reviewContext, [acceptSeg01()]), null, 2)}\n`, "utf8");

    const imported = runCreator(cwd, ["director", "review", "import", "demo", capturePath]);
    expect(imported.status).toBe(0);
    expect(imported.stdout).toContain("DIRECTOR_REVIEW_IMPORTED demo 1");
    expect(JSON.parse(readFileSync(join(projectDirectory, "review", "director-decisions.json"), "utf8")).reviews).toHaveLength(1);
  });
});

function runCreator(cwd: string, arguments_: readonly string[]) {
  const environment = { ...process.env };
  delete environment.MINIMAX_API_KEY;
  return spawnSync(process.execPath, [cliPath, ...arguments_], {
    cwd,
    encoding: "utf8",
    env: environment,
  });
}
