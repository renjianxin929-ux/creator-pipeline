import { describe, expect, it } from "vitest";

import { loadStyleOS } from "../src/brand/style-os.ts";
import { compileDirectorContext, isDirectorContextStale } from "../src/director/compile-context.ts";
import { parseDirectorAdapterOutput, type DirectorAdapter } from "../src/director/adapter.ts";
import {
  DIRECTOR_HARD_CONSTRAINTS,
  parseDirectorContext,
  parseDirectorPlan,
} from "../src/contracts/index.ts";
import { sha256Bytes } from "../src/project/file-hash.ts";

const VENDOR_PATTERN = /(asta|gpt|claude|codex|hyperframes|remotion|ffmpeg|opencut|smartsub|video-?use|openmontage)/i;

function baseProject() {
  return {
    id: "proj-demo-1",
    slug: "demo",
    created_at: "2026-09-08T00:00:00.000Z",
    budget: { generation_cash_cny: 10, used_cash_cny: 0, subscription_generation_count: 0 },
  };
}

const FROZEN_TEXT = "# Demo\n\nLine two.\nLine three.\n";

function cameraRecord() {
  const sha256 = "c".repeat(64);
  return {
    id: `sha256:${sha256}`,
    sha256,
    byte_size: 10,
    path: "raw/camera/talk.mp4",
    kind: "camera" as const,
  };
}

function audioRecord() {
  const sha256 = "d".repeat(64);
  return {
    id: `sha256:${sha256}`,
    sha256,
    byte_size: 8,
    path: "raw/audio/voice.mp3",
    kind: "audio" as const,
  };
}

function generatedAssetRecord() {
  return {
    asset_id: "asset_009",
    type: "video" as const,
    source: "manual" as const,
    role: "concept_broll",
    path: "assets/generated/a.mp4",
    has_watermark: false,
    generation: { attempt: 1, cash_cost_cny: 0, subscription_quota_used: false },
  };
}

function baseTranscript() {
  return {
    source_media_id: `sha256:${"c".repeat(64)}`,
    segments: [
      { id: "seg_001", start_ms: 0, end_ms: 1000, speaker: "spk_0", text: "hello world" },
    ],
  };
}

function editingRule(overrides = {}) {
  return {
    id: "editing.proof.real-evidence-first",
    status: "CANDIDATE",
    applies_to: ["PROOF"],
    rule: "Prefer real evidence over decorative B-roll.",
    allowed_visuals: ["visual.proof.real-demo"],
    why: "Evidence keeps the claim credible.",
    ...overrides,
  };
}

function qualityGate(overrides = {}) {
  return {
    id: "quality.proof.no-decorative-cover",
    status: "CANDIDATE",
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
    styleSnapshot: loadStyleOS("1.0"),
    ...overrides,
  });
}

/** Snapshot with every domain emptied; tests declare exactly what they need. */
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

describe("P9.3A director context contract", () => {
  it("compiles a valid context from project, frozen bytes, style, and media facts", () => {
    const context = compileWith({
      transcript: baseTranscript(),
      mediaRecords: [cameraRecord()],
    });

    expect(parseDirectorContext(context).version).toBe(1);
    expect(context.script_text).toBe(FROZEN_TEXT);
    expect(context.transcript?.segments).toHaveLength(1);
    expect(context.hard_constraints).toHaveLength(DIRECTOR_HARD_CONSTRAINTS.length);
    expect(context.output_contract).toEqual({ kind: "director-plan", version: 1 });
  });

  it("binds the exact project identity", () => {
    const context = compileWith();
    expect(context.project_slug).toBe("demo");
    expect(context.project_id).toBe("proj-demo-1");
  });

  it("binds the exact frozen-script byte identity", () => {
    const context = compileWith();
    const bytes = Buffer.from(FROZEN_TEXT, "utf8");

    expect(context.frozen_script).toEqual({
      path: "content/frozen-script.md",
      sha256: sha256Bytes(bytes),
      byte_size: bytes.byteLength,
    });
  });

  it("routes FROZEN items into mandatory constraints", () => {
    const context = compileWith({
      styleSnapshot: {
        ...emptySnapshot(),
        editing_grammar: { version: 1, style_version: "1.0", items: [editingRule({ status: "FROZEN" })] },
      },
    });

    expect(context.style_guidance.mandatory_constraints).toHaveLength(1);
    expect(context.style_guidance.mandatory_constraints[0]?.domain).toBe("editing-grammar");
    expect(context.style_guidance.strong_guidance).toEqual([]);
    expect(context.style_guidance.optional_candidates).toEqual([]);
  });

  it("routes OBSERVED items into strong guidance only", () => {
    const context = compileWith({
      styleSnapshot: {
        ...emptySnapshot(),
        editing_grammar: { version: 1, style_version: "1.0", items: [editingRule({ status: "OBSERVED" })] },
      },
    });

    expect(context.style_guidance.strong_guidance).toHaveLength(1);
    expect(context.style_guidance.mandatory_constraints).toEqual([]);
    expect(context.style_guidance.optional_candidates).toEqual([]);
  });

  it("routes CANDIDATE items into optional candidates only", () => {
    const context = compileWith();

    expect(context.style_guidance.optional_candidates.length).toBeGreaterThan(0);
    expect(context.style_guidance.mandatory_constraints).toEqual([]);
    expect(context.style_guidance.strong_guidance).toEqual([]);
  });

  it("keeps UNSET items out of every instruction tier", () => {
    const context = compileWith({
      styleSnapshot: {
        ...emptySnapshot(),
        editing_grammar: {
          version: 1,
          style_version: "1.0",
          items: [editingRule({ id: "editing.proof.specific-but-undecided", status: "UNSET" })],
        },
      },
    });

    expect(context.style_guidance.mandatory_constraints).toEqual([]);
    expect(context.style_guidance.strong_guidance).toEqual([]);
    expect(context.style_guidance.optional_candidates).toEqual([]);
    expect(context.style_guidance.unknown_or_unset).toContainEqual({
      domain: "editing-grammar",
      unset_item_ids: ["editing.proof.specific-but-undecided"],
    });
  });

  it("never upgrades a CANDIDATE HARD gate into a mandatory constraint", () => {
    const context = compileWith({
      styleSnapshot: {
        ...emptySnapshot(),
        quality_gates: { version: 1, style_version: "1.0", items: [qualityGate()] },
      },
    });

    expect(context.style_guidance.mandatory_constraints).toEqual([]);
    expect(context.style_guidance.optional_candidates).toHaveLength(1);
    expect(context.style_guidance.optional_candidates[0]?.item).toMatchObject({
      status: "CANDIDATE",
      severity: "HARD",
    });
  });

  it("keeps lifecycle and severity orthogonal across all four combinations", () => {
    const context = compileWith({
      styleSnapshot: {
        ...emptySnapshot(),
        quality_gates: {
          version: 1,
          style_version: "1.0",
          items: [
            qualityGate({ id: "quality.proof.quad-frozen-hard", status: "FROZEN", severity: "HARD" }),
            qualityGate({
              id: "quality.proof.quad-frozen-advisory",
              status: "FROZEN",
              severity: "ADVISORY",
            }),
            qualityGate({
              id: "quality.proof.quad-observed-hard",
              status: "OBSERVED",
              severity: "HARD",
            }),
            qualityGate({
              id: "quality.proof.quad-candidate-hard",
              status: "CANDIDATE",
              severity: "HARD",
            }),
          ],
        },
      },
    });

    const ids = (entries: readonly { item: { id: string } }[]) =>
      entries.map((entry) => entry.item.id);
    expect(ids(context.style_guidance.mandatory_constraints)).toEqual([
      "quality.proof.quad-frozen-hard",
    ]);
    expect(ids(context.style_guidance.approved_advisories)).toEqual([
      "quality.proof.quad-frozen-advisory",
    ]);
    expect(ids(context.style_guidance.strong_guidance)).toEqual([
      "quality.proof.quad-observed-hard",
    ]);
    expect(ids(context.style_guidance.optional_candidates)).toEqual([
      "quality.proof.quad-candidate-hard",
    ]);
  });

  it("admits a FROZEN HARD gate into mandatory constraints", () => {
    const context = compileWith({
      styleSnapshot: {
        ...emptySnapshot(),
        quality_gates: {
          version: 1,
          style_version: "1.0",
          items: [qualityGate({ status: "FROZEN" })],
        },
      },
    });

    expect(context.style_guidance.mandatory_constraints).toHaveLength(1);
    expect(context.style_guidance.mandatory_constraints[0]?.item).toMatchObject({
      status: "FROZEN",
      severity: "HARD",
    });
  });

  it("preserves reference do_not_copy alongside reusable aspects", () => {
    const seed = loadStyleOS("1.0");
    const context = compileWith({
      styleSnapshot: {
        ...seed,
        references: {
          version: 1,
          style_version: "1.0",
          items: [
            {
              id: "ref_001",
              source: "https://example.com/clip",
              category: "proof-transition",
              description: "Claim, then evidence.",
              founder_note: "Good pacing.",
              why_saved: "Timing.",
              reusable_aspects: ["pacing"],
              do_not_copy: ["typography", "color palette"],
              status: "CANDIDATE",
              provenance: "FOUNDER",
            },
          ],
        },
      },
    });

    expect(context.references[0]).toMatchObject({
      reusable_aspects: ["pacing"],
      do_not_copy: ["typography", "color palette"],
      provenance: "FOUNDER",
      status: "CANDIDATE",
    });
  });

  it("lets a FROZEN reference stay evidence without cascading rule status", () => {
    const seed = loadStyleOS("1.0");
    const context = compileWith({
      styleSnapshot: {
        ...seed,
        references: {
          version: 1,
          style_version: "1.0",
          items: [
            {
              id: "ref_002",
              source: "https://example.com/clip",
              category: "proof-transition",
              description: "Claim, then evidence.",
              founder_note: "Good.",
              why_saved: "Timing.",
              reusable_aspects: ["pacing"],
              linked_editing_rule_ids: ["editing.proof.real-evidence-first"],
              status: "FROZEN",
              provenance: "FOUNDER",
            },
          ],
        },
      },
    });

    expect(context.references[0]?.status).toBe("FROZEN");
    const rule = context.style_guidance.optional_candidates.find(
      (entry) => entry.domain === "editing-grammar",
    );
    expect(rule?.item).toMatchObject({
      id: "editing.proof.real-evidence-first",
      status: "CANDIDATE",
    });
  });

  it("rejects vendor-specific fields and names", () => {
    expect(() => parseDirectorContext({ ...compileWith(), asta_prompt: "x" })).toThrow();
    expect(JSON.stringify(compileWith())).not.toMatch(VENDOR_PATTERN);
  });

  it("reports known unknowns instead of assuming missing inputs", () => {
    const context = compileWith();
    const areas = context.known_unknowns.map((entry) => entry.area);

    expect(areas).toContain("transcript");
    expect(areas).toContain("media.talking-footage");
    expect(areas).toContain("media.screen-demo");
  });
});

describe("P9.3A provider-neutral director seam", () => {
  const adapter: DirectorAdapter = {
    id: "test-double",
    async direct(context) {
      return parseDirectorPlan({
        version: 1,
        project_slug: context.project_slug,
        project_id: context.project_id,
        frozen_script: { ...context.frozen_script },
        style_reference: { style_version: context.style_version },
        segments: [
          {
            segment_id: "seg_01",
            script_anchor: { start_line: 1, end_line: 1 },
            semantic_role: "HOOK",
            primary_visual: "visual.hook.talking-head",
            allowed_visuals: ["visual.hook.talking-head"],
            caption_mode: "default",
            reason: "Test double keeps the speaker primary.",
            confidence: 0.5,
          },
        ],
      });
    },
  };

  it("types the seam strictly as DirectorContext in and DirectorPlan out", async () => {
    const context = compileWith();
    const plan = await adapter.direct(context);

    expect(plan.project_slug).toBe(context.project_slug);
    expect(plan.project_id).toBe(context.project_id);
    expect(plan.frozen_script.sha256).toBe(context.frozen_script.sha256);
    expect(parseDirectorAdapterOutput(plan)).toEqual(plan);
  });

  it("refuses an EditPlan smuggled in as Director output", () => {
    expect(() =>
      parseDirectorAdapterOutput({
        version: 1,
        format: "9:16",
        timeline: [
          {
            id: "clip_001",
            source: "raw/camera/talk.mp4",
            source_start_ms: 0,
            source_end_ms: 1000,
            layout: "layout.talking-head",
            caption: true,
          },
        ],
      }),
    ).toThrow();
  });
});

describe("P9.3A script visual risk seam", () => {
  it("parses a risk with anchor, reason, severity, and advisory action", () => {
    const context = compileWith();
    expect(context.script_visual_risks).toEqual([]);

    const risk = {
      id: "risk_001",
      type: "SCRIPT_VISUAL_RISK",
      script_anchor: { start_line: 2, end_line: 4 },
      reason: "Abstract passage with no demo or evidence carrier.",
      severity: "high",
      suggested_action: "Ask the Founder for a screen recording covering these lines.",
    };
    expect(parseDirectorContext({ ...context, script_visual_risks: [risk] }).script_visual_risks).toHaveLength(1);
  });

  it("gives a risk no field that could rewrite the Frozen Script", () => {
    const context = compileWith({
      styleSnapshot: loadStyleOS("1.0"),
    });
    expect(context.script_visual_risks).toEqual([]);
    expect(context.script_text).toBe(FROZEN_TEXT);
  });
});

describe("P9.3A determinism and staleness", () => {
  it("compiles deterministically from the same inputs", () => {
    expect(compileWith()).toEqual(compileWith());
  });

  it("retires the context when frozen bytes change", () => {
    const context = compileWith();
    const changed = sha256Bytes(Buffer.from("# Changed\n", "utf8"));

    expect(isDirectorContextStale(context, baseProject(), context.frozen_script.sha256, "1.0")).toBe(
      false,
    );
    expect(isDirectorContextStale(context, baseProject(), changed, "1.0")).toBe(true);
  });

  it("retires the context when the style version changes", () => {
    const context = compileWith();
    expect(isDirectorContextStale(context, baseProject(), context.frozen_script.sha256, "1.1")).toBe(
      true,
    );
  });

  it("retires the context against a different project identity", () => {
    const context = compileWith();

    expect(
      isDirectorContextStale(
        context,
        { ...baseProject(), id: "proj-other-9" },
        context.frozen_script.sha256,
        "1.0",
      ),
    ).toBe(true);
    expect(
      isDirectorContextStale(
        context,
        { ...baseProject(), slug: "other" },
        context.frozen_script.sha256,
        "1.0",
      ),
    ).toBe(true);
  });

  it("proves talking footage only with real camera media", () => {
    const audioOnly = compileWith({ mediaRecords: [audioRecord()] });
    expect(audioOnly.media_assets.availability.has_talking_footage).toBe(false);
    expect(audioOnly.media_assets.availability.has_audio).toBe(true);

    const withCamera = compileWith({ mediaRecords: [cameraRecord()] });
    expect(withCamera.media_assets.availability.has_talking_footage).toBe(true);
  });

  it("detects generated assets from generation metadata, not vendor names", () => {
    const generated = compileWith({ assetRecords: [generatedAssetRecord()] });
    expect(generated.media_assets.availability.has_generated_asset).toBe(true);

    const collected = compileWith({
      assetRecords: [{ ...generatedAssetRecord(), generation: undefined }],
    });
    expect(collected.media_assets.availability.has_generated_asset).toBe(false);
    expect(JSON.stringify(generatedAssetRecord())).not.toMatch(
      /(asta|gpt|claude|codex|hyperframes|remotion|ffmpeg|opencut|smartsub|video-?use|openmontage)/i,
    );
  });
});
