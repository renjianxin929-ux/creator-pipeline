import { readdirSync, readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseFounderDecisionDataset, styleLifecycleValues } from "../src/contracts/index.ts";
import { initializeProject, writeProjectDirectorDecisions } from "../src/project/project-store.ts";
import {
  discoverProjectStyleCandidates,
  discoverStyleCandidates,
  exportStylePatchProposal,
  recordStyleCandidateApproval,
} from "../src/review/style-candidate-discovery.ts";

const temporaryDirectories: string[] = [];
const STYLE_DIR = join(process.cwd(), "brand", "v1.0", "style");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const SHA = "a".repeat(64);

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    segment_id: "seg_01",
    script_anchor: { start_line: 1, end_line: 2 },
    semantic_role: "CLAIM",
    primary_visual: "visual.claim.decorative-broll",
    allowed_visuals: ["visual.claim.decorative-broll", "visual.claim.talking-head"],
    caption_mode: "default",
    reason: "director first pass",
    confidence: 0.7,
    ...overrides,
  };
}

function talkingHeadChange(overrides: Record<string, unknown> = {}) {
  return {
    primary_visual: { op: "replace", value: "visual.claim.talking-head" },
    allowed_visuals: { op: "replace", value: ["visual.claim.talking-head"] },
    ...overrides,
  };
}

function changeDecision(
  decisionId: string,
  options: {
    reuse_scope?: "PROJECT_LOCAL" | "REUSABLE_CANDIDATE";
    reason?: string;
    replacement?: Record<string, unknown>;
    proposal?: Record<string, unknown>;
    segment_id?: string;
  } = {},
) {
  const segment = proposal({
    ...(options.proposal ?? {}),
    ...(options.segment_id === undefined ? {} : { segment_id: options.segment_id }),
  });
  return {
    decision_id: decisionId,
    segment_id: segment.segment_id,
    proposal: segment,
    action: "CHANGE",
    reason: options.reason ?? "founder correction",
    replacement: options.replacement ?? talkingHeadChange(),
    reuse_scope: options.reuse_scope ?? "REUSABLE_CANDIDATE",
  };
}

function dataset(projectId: string, reviews: unknown[]) {
  return parseFounderDecisionDataset({
    version: 1,
    project_slug: "demo",
    project_id: projectId,
    reviews: reviews.map((review) => ({
      director_plan_identity: {
        director_plan_sha256: SHA,
        frozen_script_sha256: SHA,
        frozen_script_byte_size: 12,
        style_version: "1.0",
      },
      preview_reference: { preview_path: "render/preview.mp4", preview_sha256: SHA },
      ...((review as Record<string, unknown>) ?? {}),
    })),
  });
}

function snapshotStyleBytes(): Record<string, string> {
  const files = readdirSync(STYLE_DIR).sort();
  return Object.fromEntries(files.map((file) => [file, readFileSync(join(STYLE_DIR, file), "utf8")]));
}

describe("P9.4C style candidate discovery", () => {
  it("excludes PROJECT_LOCAL decisions from reusable discovery", () => {
    const discovered = discoverStyleCandidates(
      dataset("proj-1", [
        {
          review_id: "review_01",
          decisions: [
            changeDecision("decision_a", { reuse_scope: "PROJECT_LOCAL" }),
            changeDecision("decision_b", { reuse_scope: "PROJECT_LOCAL" }),
          ],
        },
      ]),
    );
    expect(discovered.candidates).toEqual([]);
  });

  it("does not treat a single reusable decision as a repeated pattern", () => {
    const discovered = discoverStyleCandidates(
      dataset("proj-1", [
        {
          review_id: "review_01",
          decisions: [changeDecision("decision_a")],
        },
      ]),
    );
    expect(discovered.candidates).toEqual([]);
  });

  it("groups two identical normalized changes into one repeated candidate", () => {
    const discovered = discoverStyleCandidates(
      dataset("proj-1", [
        {
          review_id: "review_01",
          decisions: [changeDecision("decision_a"), changeDecision("decision_b", { segment_id: "seg_02" })],
        },
      ]),
    );
    expect(discovered.candidates).toHaveLength(1);
    expect(discovered.candidates[0]?.occurrence_count).toBe(2);
    expect(discovered.candidates[0]?.status).toBe("DISCOVERED");
    expect(discovered.candidates[0]?.affected_semantic_roles).toEqual(["CLAIM"]);
    expect(discovered.candidates[0]?.field_changes.some((change) => change.field === "primary_visual")).toBe(true);
  });

  it("does not merge changes from different semantic roles", () => {
    const discovered = discoverStyleCandidates(
      dataset("proj-1", [
        {
          review_id: "review_01",
          decisions: [
            changeDecision("decision_a"),
            changeDecision("decision_b", {
              proposal: {
                semantic_role: "PROOF",
                primary_visual: "visual.proof.decorative-broll",
                allowed_visuals: ["visual.proof.decorative-broll", "visual.proof.real-demo"],
              },
              replacement: {
                primary_visual: { op: "replace", value: "visual.proof.real-demo" },
                allowed_visuals: { op: "replace", value: ["visual.proof.real-demo"] },
              },
            }),
            changeDecision("decision_c", { segment_id: "seg_03" }),
            changeDecision("decision_d", {
              segment_id: "seg_04",
              proposal: {
                segment_id: "seg_04",
                semantic_role: "PROOF",
                primary_visual: "visual.proof.decorative-broll",
                allowed_visuals: ["visual.proof.decorative-broll", "visual.proof.real-demo"],
              },
              replacement: {
                primary_visual: { op: "replace", value: "visual.proof.real-demo" },
                allowed_visuals: { op: "replace", value: ["visual.proof.real-demo"] },
              },
            }),
          ],
        },
      ]),
    );
    expect(discovered.candidates).toHaveLength(2);
    expect(discovered.candidates.map((item) => item.affected_semantic_roles[0]).sort()).toEqual(["CLAIM", "PROOF"]);
  });

  it("does not merge different replacement values", () => {
    const discovered = discoverStyleCandidates(
      dataset("proj-1", [
        {
          review_id: "review_01",
          decisions: [
            changeDecision("decision_a"),
            changeDecision("decision_b", { segment_id: "seg_02" }),
            changeDecision("decision_c", {
              segment_id: "seg_03",
              replacement: {
                primary_visual: { op: "replace", value: "visual.claim.talking-head" },
                allowed_visuals: {
                  op: "replace",
                  value: ["visual.claim.talking-head", "visual.claim.title-card"],
                },
              },
            }),
            changeDecision("decision_d", {
              segment_id: "seg_04",
              replacement: {
                primary_visual: { op: "replace", value: "visual.claim.talking-head" },
                allowed_visuals: {
                  op: "replace",
                  value: ["visual.claim.talking-head", "visual.claim.title-card"],
                },
              },
            }),
          ],
        },
      ]),
    );
    expect(discovered.candidates).toHaveLength(2);
  });

  it("does not use free-text reason as the grouping key", () => {
    const discovered = discoverStyleCandidates(
      dataset("proj-1", [
        {
          review_id: "review_01",
          decisions: [
            changeDecision("decision_a", { reason: "speaker should stay" }),
            changeDecision("decision_b", { segment_id: "seg_02", reason: "totally different prose" }),
          ],
        },
      ]),
    );
    expect(discovered.candidates).toHaveLength(1);
    expect(discovered.candidates[0]?.signature).not.toContain("speaker should stay");
    expect(discovered.candidates[0]?.signature).not.toContain("totally different prose");
  });

  it("counts unique decision ids only once", () => {
    const discovered = discoverStyleCandidates(
      dataset("proj-1", [
        {
          review_id: "review_01",
          decisions: [changeDecision("decision_a"), changeDecision("decision_b", { segment_id: "seg_02" })],
        },
      ]),
    );
    expect(discovered.candidates[0]?.evidence_decision_ids).toEqual(["decision_a", "decision_b"]);
    expect(discovered.candidates[0]?.occurrence_count).toBe(2);
  });

  it("assigns deterministic candidate ids", () => {
    const first = discoverStyleCandidates(
      dataset("proj-1", [
        {
          review_id: "review_01",
          decisions: [changeDecision("decision_a"), changeDecision("decision_b", { segment_id: "seg_02" })],
        },
      ]),
    );
    const second = discoverStyleCandidates(
      dataset("proj-1", [
        {
          review_id: "review_99",
          decisions: [changeDecision("decision_b", { segment_id: "seg_02" }), changeDecision("decision_a")],
        },
      ]),
    );
    expect(first.candidates[0]?.candidate_id).toBe(second.candidates[0]?.candidate_id);
    expect(first.candidates[0]?.candidate_id).toMatch(/^candidate_[a-f0-9]{64}$/);
  });

  it("produces the same discovery bytes for the same dataset", () => {
    const input = dataset("proj-1", [
      {
        review_id: "review_01",
        decisions: [changeDecision("decision_a"), changeDecision("decision_b", { segment_id: "seg_02" })],
      },
    ]);
    expect(JSON.stringify(discoverStyleCandidates(input))).toBe(JSON.stringify(discoverStyleCandidates(input)));
  });

  it("never mutates Style OS bytes", () => {
    const before = snapshotStyleBytes();
    const input = dataset("proj-1", [
      {
        review_id: "review_01",
        decisions: [changeDecision("decision_a"), changeDecision("decision_b", { segment_id: "seg_02" })],
      },
    ]);
    const discovered = discoverStyleCandidates(input);
    const proposal = exportStylePatchProposal(discovered.candidates[0]!, {
      approval_id: "approval_01",
      candidate_id: discovered.candidates[0]!.candidate_id,
      action: "APPROVE_STYLE_PROPOSAL",
    });
    expect(proposal.applies_to_style_os).toBe(false);
    expect(snapshotStyleBytes()).toEqual(before);
  });

  it("does not treat a Founder approval record as FROZEN Style lifecycle", () => {
    const cwd = mkdtempSync(join(tmpdir(), "creator-pipeline-p94c-test-"));
    temporaryDirectories.push(cwd);
    const project = initializeProject("demo", cwd);
    const input = dataset(project.identity.id, [
      {
        review_id: "review_01",
        decisions: [changeDecision("decision_a"), changeDecision("decision_b", { segment_id: "seg_02" })],
      },
    ]);
    writeProjectDirectorDecisions("demo", input, cwd);
    const before = snapshotStyleBytes();
    const discovered = discoverProjectStyleCandidates("demo", cwd);
    const approvals = recordStyleCandidateApproval(
      "demo",
      {
        approval_id: "approval_01",
        candidate_id: discovered.candidates[0]!.candidate_id,
        action: "APPROVE_STYLE_PROPOSAL",
      },
      undefined,
      discovered,
      cwd,
    );
    expect(approvals.approvals[0]?.action).toBe("APPROVE_STYLE_PROPOSAL");
    expect(discovered.candidates[0]?.status).toBe("DISCOVERED");
    expect(styleLifecycleValues).not.toContain("DISCOVERED");
    expect(styleLifecycleValues).not.toContain("APPROVE_STYLE_PROPOSAL");
    expect(JSON.stringify(approvals)).not.toContain("FROZEN");
    expect(snapshotStyleBytes()).toEqual(before);
  });

  it("has no LLM or provider dependency", () => {
    const source = readFileSync(join(process.cwd(), "src/review/style-candidate-discovery.ts"), "utf8");
    expect(source).not.toMatch(/openai|anthropic|xai|asta|fetch\(|generateText|llm/i);
    expect(discoverStyleCandidates.name).toBe("discoverStyleCandidates");
  });
});
