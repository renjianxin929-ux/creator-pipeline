import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { previewApprovalSchema } from "../src/contracts/approval.ts";
import {
  applyFounderReplacement,
  DIRECTOR_DECISIONS_RELATIVE_PATH,
  parseFounderDecisionDataset,
  previewReferenceSchema,
  styleLifecycleValues,
} from "../src/contracts/index.ts";
import { sha256Bytes } from "../src/project/file-hash.ts";
import {
  initializeProject,
  readProjectDirectorDecisions,
  writeProjectDirectorDecisions,
} from "../src/project/project-store.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    segment_id: "seg_01",
    script_anchor: { start_line: 1, end_line: 2 },
    semantic_role: "CLAIM",
    primary_visual: "visual.claim.decorative-broll",
    allowed_visuals: ["visual.claim.decorative-broll", "visual.claim.talking-head"],
    forbidden_visuals: ["visual.claim.chaos-cut"],
    caption_mode: "emphasis",
    emphasis_text: "this is the claim",
    motion_id: "motion.keyword-pop",
    director_intent: "cover the claim with decoration",
    reason: "director first pass",
    confidence: 0.7,
    ...overrides,
  };
}

function identity() {
  return {
    director_plan_sha256: SHA_A,
    frozen_script_sha256: SHA_B,
    frozen_script_byte_size: 128,
    style_version: "1.0",
  };
}

function previewRef() {
  return {
    preview_path: "render/preview.mp4",
    preview_sha256: SHA_C,
    edit_plan_sha256: SHA_A,
  };
}

function acceptDecision(overrides: Record<string, unknown> = {}) {
  return {
    decision_id: "decision_accept_01",
    segment_id: "seg_01",
    proposal: proposal(),
    action: "ACCEPT",
    reuse_scope: "PROJECT_LOCAL",
    ...overrides,
  };
}

function rejectDecision(overrides: Record<string, unknown> = {}) {
  return {
    decision_id: "decision_reject_01",
    segment_id: "seg_01",
    proposal: proposal(),
    action: "REJECT",
    reason: "claim establishment; speaker should remain primary",
    reuse_scope: "REUSABLE_CANDIDATE",
    ...overrides,
  };
}

function changeDecision(overrides: Record<string, unknown> = {}) {
  return {
    decision_id: "decision_change_01",
    segment_id: "seg_01",
    proposal: proposal(),
    action: "CHANGE",
    reason: "claim needs talking-head, not decorative b-roll",
    replacement: {
      primary_visual: { op: "replace", value: "visual.claim.talking-head" },
      allowed_visuals: {
        op: "replace",
        value: ["visual.claim.talking-head"],
      },
    },
    reuse_scope: "REUSABLE_CANDIDATE",
    ...overrides,
  };
}

function review(overrides: Record<string, unknown> = {}) {
  return {
    review_id: "review_01",
    director_plan_identity: identity(),
    preview_reference: previewRef(),
    decisions: [changeDecision()],
    ...overrides,
  };
}

function dataset(projectId: string, overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    project_slug: "demo",
    project_id: projectId,
    reviews: [review()],
    ...overrides,
  };
}

describe("P9.4A founder decision dataset contract", () => {
  it("requires version, project_slug, project_id, and reviews", () => {
    const parsed = parseFounderDecisionDataset({
      version: 1,
      project_slug: "demo",
      project_id: "proj-1",
    });
    expect(parsed.reviews).toEqual([]);
    expect(() => parseFounderDecisionDataset({ project_slug: "demo", project_id: "proj-1" })).toThrow();
    expect(() => parseFounderDecisionDataset({ version: 1, project_id: "proj-1", reviews: [] })).toThrow();
    expect(() => parseFounderDecisionDataset({ version: 1, project_slug: "demo", reviews: [] })).toThrow();
  });

  it("requires review_id, director_plan_identity, preview_reference, and decisions", () => {
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", {
          reviews: [{ director_plan_identity: identity(), preview_reference: previewRef(), decisions: [acceptDecision()] }],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", {
          reviews: [{ review_id: "review_01", preview_reference: previewRef(), decisions: [acceptDecision()] }],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", {
          reviews: [{ review_id: "review_01", director_plan_identity: identity(), decisions: [acceptDecision()] }],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", {
          reviews: [{ review_id: "review_01", director_plan_identity: identity(), preview_reference: previewRef(), decisions: [] }],
        }),
      ),
    ).toThrow();
  });

  it("stores multiple review rounds against the same project", () => {
    const parsed = parseFounderDecisionDataset(
      dataset("proj-1", {
        reviews: [
          review({ review_id: "review_01", decisions: [acceptDecision({ decision_id: "decision_a" })] }),
          review({ review_id: "review_02", decisions: [rejectDecision({ decision_id: "decision_b" })] }),
        ],
      }),
    );
    expect(parsed.reviews).toHaveLength(2);
    expect(parsed.reviews.map((item) => item.review_id)).toEqual(["review_01", "review_02"]);
  });

  it("records director plan identity with sha256 fields and style version", () => {
    const bytes = Buffer.from("director-plan-bytes", "utf8");
    const directorPlanSha256 = sha256Bytes(bytes);
    const frozenSha256 = sha256Bytes(Buffer.from("frozen", "utf8"));
    const parsed = parseFounderDecisionDataset(
      dataset("proj-1", {
        reviews: [
          review({
            director_plan_identity: {
              director_plan_sha256: directorPlanSha256,
              frozen_script_sha256: frozenSha256,
              frozen_script_byte_size: 6,
              style_version: "1.0",
            },
          }),
        ],
      }),
    );
    expect(parsed.reviews[0]?.director_plan_identity).toEqual({
      director_plan_sha256: directorPlanSha256,
      frozen_script_sha256: frozenSha256,
      frozen_script_byte_size: 6,
      style_version: "1.0",
    });
    expect(directorPlanSha256).toHaveLength(64);
  });

  it("reuses the shared sha256 helper rather than a second digest", () => {
    const bytes = Buffer.from([1, 2, 3, 4]);
    expect(sha256Bytes(bytes)).toBe(sha256Bytes(bytes));
    expect(sha256Bytes(bytes)).not.toBe(sha256Bytes(Buffer.from([1, 2, 3, 5])));
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", {
          reviews: [
            review({
              director_plan_identity: { ...identity(), director_plan_sha256: "not-a-hash" },
            }),
          ],
        }),
      ),
    ).toThrow();
  });

  it("stores a preview reference with path, preview sha256, and optional edit plan sha256", () => {
    const parsed = parseFounderDecisionDataset(
      dataset("proj-1", {
        reviews: [
          review({
            preview_reference: { preview_path: "render/preview.mp4", preview_sha256: SHA_C },
          }),
        ],
      }),
    );
    expect(parsed.reviews[0]?.preview_reference.edit_plan_sha256).toBeUndefined();
    expect(previewReferenceSchema.parse(previewRef()).edit_plan_sha256).toBe(SHA_A);
  });

  it("keeps PreviewReference distinct from PreviewApproval", () => {
    const reference = previewRef();
    const approval = {
      preview_path: "render/preview.mp4",
      preview_sha256: SHA_C,
      approved_at: "2026-09-08T00:00:00.000Z",
      approved_by: "founder",
      edit_plan_sha256: SHA_A,
    };
    expect(previewReferenceSchema.parse(reference)).toEqual(reference);
    expect(previewApprovalSchema.parse(approval)).toEqual(approval);
    expect(() => previewReferenceSchema.parse(approval)).toThrow();
    expect(() => previewApprovalSchema.parse(reference)).toThrow();
  });

  it("allows a review record without any preview approval fields", () => {
    const parsed = parseFounderDecisionDataset(dataset("proj-1"));
    expect(parsed.reviews[0]?.preview_reference).not.toHaveProperty("approved_at");
    expect(parsed.reviews[0]?.preview_reference).not.toHaveProperty("approved_by");
  });

  it("accepts only ACCEPT, REJECT, and CHANGE", () => {
    expect(parseFounderDecisionDataset(dataset("proj-1", { reviews: [review({ decisions: [acceptDecision()] })] })).reviews[0]?.decisions[0]?.action).toBe("ACCEPT");
    expect(parseFounderDecisionDataset(dataset("proj-1", { reviews: [review({ decisions: [rejectDecision()] })] })).reviews[0]?.decisions[0]?.action).toBe("REJECT");
    expect(parseFounderDecisionDataset(dataset("proj-1")).reviews[0]?.decisions[0]?.action).toBe("CHANGE");
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", {
          reviews: [review({ decisions: [acceptDecision({ action: "MAYBE" })] })],
        }),
      ),
    ).toThrow();
  });

  it("allows ACCEPT without replacement and with optional reason", () => {
    const withoutReason = parseFounderDecisionDataset(
      dataset("proj-1", { reviews: [review({ decisions: [acceptDecision()] })] }),
    );
    expect(withoutReason.reviews[0]?.decisions[0]).not.toHaveProperty("replacement");
    expect(withoutReason.reviews[0]?.decisions[0]).not.toHaveProperty("reason");

    const withReason = parseFounderDecisionDataset(
      dataset("proj-1", {
        reviews: [review({ decisions: [acceptDecision({ reason: "keep the director choice" })] })],
      }),
    );
    expect(withReason.reviews[0]?.decisions[0]).toMatchObject({ action: "ACCEPT", reason: "keep the director choice" });

    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", {
          reviews: [
            review({
              decisions: [
                acceptDecision({
                  replacement: { primary_visual: { op: "replace", value: "visual.claim.talking-head" } },
                }),
              ],
            }),
          ],
        }),
      ),
    ).toThrow();
  });

  it("requires REJECT reason and forbids replacement", () => {
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", { reviews: [review({ decisions: [rejectDecision({ reason: undefined })] })] }),
      ),
    ).toThrow();
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", {
          reviews: [
            review({
              decisions: [
                rejectDecision({
                  replacement: { primary_visual: { op: "replace", value: "visual.claim.talking-head" } },
                }),
              ],
            }),
          ],
        }),
      ),
    ).toThrow();
  });

  it("requires CHANGE reason and a structured replacement", () => {
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", { reviews: [review({ decisions: [changeDecision({ reason: undefined })] })] }),
      ),
    ).toThrow();
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", { reviews: [review({ decisions: [changeDecision({ replacement: undefined })] })] }),
      ),
    ).toThrow();
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", { reviews: [review({ decisions: [changeDecision({ replacement: {} })] })] }),
      ),
    ).toThrow();
  });

  it("stores the full DirectorSegment proposal through directorSegmentSchema", () => {
    const parsed = parseFounderDecisionDataset(dataset("proj-1"));
    expect(parsed.reviews[0]?.decisions[0]?.proposal).toMatchObject(proposal());
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", {
          reviews: [review({ decisions: [changeDecision({ proposal: { segment_id: "seg_01" } })] })],
        }),
      ),
    ).toThrow();
  });

  it("allows CHANGE patches on the declared director fields", () => {
    const parsed = parseFounderDecisionDataset(
      dataset("proj-1", {
        reviews: [
          review({
            decisions: [
              changeDecision({
                replacement: {
                  semantic_role: { op: "replace", value: "PROOF" },
                  primary_visual: { op: "replace", value: "visual.proof.real-demo" },
                  allowed_visuals: { op: "replace", value: ["visual.proof.real-demo"] },
                  forbidden_visuals: { op: "replace", value: ["visual.proof.decorative-broll"] },
                  caption_mode: { op: "replace", value: "quote" },
                  emphasis_text: { op: "replace", value: "show the evidence" },
                  motion_id: { op: "replace", value: "motion.evidence-highlight" },
                  director_intent: { op: "replace", value: "prove with real demo" },
                },
              }),
            ],
          }),
        ],
      }),
    );
    const replacement = parsed.reviews[0]?.decisions[0];
    expect(replacement?.action).toBe("CHANGE");
  });

  it("distinguishes unchanged, clear, and replace on deletable fields", () => {
    const source = proposal({
      caption_mode: "quote",
      emphasis_text: "quoted line",
      motion_id: "motion.keyword-pop",
      director_intent: "keep intent",
    });
    expect(applyFounderReplacement(source, { motion_id: { op: "unchanged" } }).motion_id).toBe("motion.keyword-pop");
    expect(applyFounderReplacement(source, { motion_id: { op: "clear" } }).motion_id).toBeUndefined();
    expect(
      applyFounderReplacement(source, { motion_id: { op: "replace", value: "motion.ui-focus" } }).motion_id,
    ).toBe("motion.ui-focus");
    expect(applyFounderReplacement(source, { emphasis_text: { op: "clear" } }).emphasis_text).toBeUndefined();
    expect(applyFounderReplacement(source, { director_intent: { op: "clear" } }).director_intent).toBeUndefined();
    expect(() => applyFounderReplacement(source, { semantic_role: { op: "clear" } })).toThrow();
  });

  it("applies a Founder replacement and revalidates through directorSegmentSchema", () => {
    const resolved = applyFounderReplacement(proposal(), {
      primary_visual: { op: "replace", value: "visual.claim.talking-head" },
      allowed_visuals: { op: "replace", value: ["visual.claim.talking-head"] },
      forbidden_visuals: { op: "replace", value: ["visual.claim.decorative-broll"] },
      caption_mode: { op: "replace", value: "default" },
      emphasis_text: { op: "clear" },
      motion_id: { op: "clear" },
    });
    expect(resolved.primary_visual).toBe("visual.claim.talking-head");
    expect(resolved.caption_mode).toBe("default");
    expect(resolved.emphasis_text).toBeUndefined();
    expect(() =>
      applyFounderReplacement(proposal(), {
        primary_visual: { op: "replace", value: "visual.claim.screenshot" },
      }),
    ).toThrow();
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", {
          reviews: [
            review({
              decisions: [
                changeDecision({
                  replacement: { primary_visual: { op: "replace", value: "visual.claim.screenshot" } },
                }),
              ],
            }),
          ],
        }),
      ),
    ).toThrow();
  });

  it("restricts reuse_scope to PROJECT_LOCAL and REUSABLE_CANDIDATE", () => {
    expect(
      parseFounderDecisionDataset(
        dataset("proj-1", { reviews: [review({ decisions: [acceptDecision({ reuse_scope: "PROJECT_LOCAL" })] })] }),
      ).reviews[0]?.decisions[0]?.reuse_scope,
    ).toBe("PROJECT_LOCAL");
    expect(
      parseFounderDecisionDataset(dataset("proj-1")).reviews[0]?.decisions[0]?.reuse_scope,
    ).toBe("REUSABLE_CANDIDATE");
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", { reviews: [review({ decisions: [acceptDecision({ reuse_scope: "FROZEN" })] })] }),
      ),
    ).toThrow();
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", { reviews: [review({ decisions: [acceptDecision({ reuse_scope: "OBSERVED" })] })] }),
      ),
    ).toThrow();
  });

  it("does not treat REUSABLE_CANDIDATE as Style lifecycle CANDIDATE, OBSERVED, or FROZEN", () => {
    expect(styleLifecycleValues).toEqual(["UNSET", "CANDIDATE", "OBSERVED", "FROZEN"]);
    expect(styleLifecycleValues).not.toContain("REUSABLE_CANDIDATE");
    expect(styleLifecycleValues).not.toContain("PROJECT_LOCAL");
    const parsed = parseFounderDecisionDataset(dataset("proj-1"));
    expect(parsed).not.toHaveProperty("status");
    expect(JSON.stringify(parsed)).not.toContain("FROZEN");
  });

  it("requires unique review_id values", () => {
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", {
          reviews: [
            review({ review_id: "review_dup", decisions: [acceptDecision({ decision_id: "decision_a" })] }),
            review({ review_id: "review_dup", decisions: [rejectDecision({ decision_id: "decision_b" })] }),
          ],
        }),
      ),
    ).toThrow();
  });

  it("requires decision_id unique across the whole dataset", () => {
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", {
          reviews: [
            review({ review_id: "review_01", decisions: [acceptDecision({ decision_id: "decision_same" })] }),
            review({ review_id: "review_02", decisions: [rejectDecision({ decision_id: "decision_same" })] }),
          ],
        }),
      ),
    ).toThrow();
  });

  it("rejects vendor-named durable ids and extra style-promotion fields", () => {
    expect(() =>
      parseFounderDecisionDataset(dataset("proj-1", { reviews: [review({ review_id: "review_asta_01" })] })),
    ).toThrow();
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", { reviews: [review({ decisions: [changeDecision({ decision_id: "decision_claude_01" })] })] }),
      ),
    ).toThrow();
    expect(() => parseFounderDecisionDataset({ ...dataset("proj-1"), status: "FROZEN" })).toThrow();
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", { reviews: [review({ decisions: [changeDecision({ director_provider: "asta" })] })] }),
      ),
    ).toThrow();
  });

  it("rejects proposal segment ids that do not match the decision", () => {
    expect(() =>
      parseFounderDecisionDataset(
        dataset("proj-1", {
          reviews: [review({ decisions: [changeDecision({ segment_id: "seg_99" })] })],
        }),
      ),
    ).toThrow();
  });
});

describe("P9.4A historical director decisions store", () => {
  it("round-trips a dataset bound to project identity", () => {
    const cwd = createTemporaryDirectory();
    const project = initializeProject("demo", cwd);
    const record = parseFounderDecisionDataset(dataset(project.identity.id));
    writeProjectDirectorDecisions("demo", record, cwd);
    expect(readProjectDirectorDecisions("demo", cwd)).toEqual(record);
    expect(DIRECTOR_DECISIONS_RELATIVE_PATH).toBe("review/director-decisions.json");
    expect(
      JSON.parse(
        readFileSync(join(cwd, "workspace", "projects", "demo", "review", "director-decisions.json"), "utf8"),
      ),
    ).toEqual(record);
  });

  it("writes historical facts without requiring current preview or director plan artifacts", () => {
    const cwd = createTemporaryDirectory();
    const project = initializeProject("demo", cwd);
    writeProjectDirectorDecisions("demo", parseFounderDecisionDataset(dataset(project.identity.id)), cwd);
    expect(readProjectDirectorDecisions("demo", cwd)?.reviews).toHaveLength(1);
  });

  it("rejects slug or project_id mismatches and leaves no valid store behind on invalid files", () => {
    const cwd = createTemporaryDirectory();
    const project = initializeProject("demo", cwd);
    expect(() =>
      writeProjectDirectorDecisions(
        "demo",
        parseFounderDecisionDataset({ ...dataset(project.identity.id), project_slug: "other" }),
        cwd,
      ),
    ).toThrow("project_slug must match");
    expect(() =>
      writeProjectDirectorDecisions("demo", parseFounderDecisionDataset(dataset("not-this-project")), cwd),
    ).toThrow("project_id must match");
    expect(readProjectDirectorDecisions("demo", cwd)).toBeUndefined();

    writeFileSync(
      join(cwd, "workspace", "projects", "demo", "review", "director-decisions.json"),
      "{not-json",
      "utf8",
    );
    expect(() => readProjectDirectorDecisions("demo", cwd)).toThrow("Unable to read valid director decisions");
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-p94a-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
