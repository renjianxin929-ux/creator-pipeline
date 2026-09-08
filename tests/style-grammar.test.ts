import { describe, expect, it } from "vitest";

import {
  parseCaptionRulesFile,
  parseEditingGrammarFile,
  parseMotionLibraryFile,
  parseQualityGatesFile,
  parseStyleManifest,
  parseVisualGrammarFile,
  styleGrammarFilePaths,
  styleGrammarFileSchemas,
} from "../src/contracts/index.ts";
import * as styleGrammarModule from "../src/contracts/style-grammar.ts";

function editingRule(overrides = {}) {
  return {
    id: "editing.proof.real-evidence-first",
    status: "CANDIDATE",
    applies_to: ["PROOF"],
    rule: "Prefer real demo, screenshot, or result evidence over decorative B-roll.",
    allowed_visuals: ["visual.proof.real-demo"],
    forbidden_visuals: ["visual.proof.decorative-broll"],
    why: "Evidence segments exist to establish credibility.",
    evidence_refs: ["ref_001"],
    ...overrides,
  };
}

function domainFile(items: unknown[]) {
  return { version: 1, style_version: "1.0", items };
}

describe("P9.2B editing grammar", () => {
  it("accepts a semantic CANDIDATE rule without claiming Founder approval", () => {
    const file = parseEditingGrammarFile(domainFile([editingRule()]));
    expect(file.items).toHaveLength(1);
    expect(file.items[0]?.status).toBe("CANDIDATE");
  });

  it("rejects an invalid semantic role", () => {
    expect(() =>
      parseEditingGrammarFile(domainFile([editingRule({ applies_to: ["MONTAGE"] })])),
    ).toThrow();
  });

  it("rejects allowed/forbidden visual and motion conflicts", () => {
    expect(() =>
      parseEditingGrammarFile(
        domainFile([
          editingRule({
            allowed_visuals: ["visual.proof.real-demo"],
            forbidden_visuals: ["visual.proof.real-demo"],
          }),
        ]),
      ),
    ).toThrow();

    expect(() =>
      parseEditingGrammarFile(
        domainFile([
          editingRule({
            allowed_motion_ids: ["motion.evidence-highlight"],
            forbidden_motion_ids: ["motion.evidence-highlight"],
          }),
        ]),
      ),
    ).toThrow();
  });

  it("rejects malformed visual and motion ids instead of a second id system", () => {
    expect(() =>
      parseEditingGrammarFile(
        domainFile([editingRule({ allowed_visuals: ["hyperframes_zoom_v2"] })]),
      ),
    ).toThrow();
    expect(() =>
      parseEditingGrammarFile(
        domainFile([editingRule({ allowed_motion_ids: ["motion.claude-proof"] })]),
      ),
    ).toThrow();
  });
});

describe("P9.2B visual and motion grammar", () => {
  it("accepts a visual pattern whose implementation is still UNSET", () => {
    const file = parseVisualGrammarFile(
      domainFile([
        {
          id: "visual.proof.real-demo",
          status: "CANDIDATE",
          purpose: "Carry spoken evidence with the real product surface.",
          applicable_roles: ["PROOF", "DEMO_ACTION"],
          layout_intent: "Real screen content stays primary and uncropped in meaning.",
          title_allowed: false,
          caption_allowed: true,
          motion_allowed: true,
          forbidden_behaviors: ["Covering evidence with decorative overlays."],
          implementation_status: "UNSET",
        },
      ]),
    );
    expect(file.items[0]?.implementation_status).toBe("UNSET");
  });

  it("accepts a motion concept whose look is entirely undecided", () => {
    const file = parseMotionLibraryFile(
      domainFile([
        {
          id: "motion.keyword-pop",
          status: "UNSET",
          purpose: "Marks a spoken keyword without covering the speaker.",
          implementation_status: "UNSET",
        },
      ]),
    );
    expect(file.items[0]).toMatchObject({ status: "UNSET", implementation_status: "UNSET" });
  });
});

describe("P9.2B caption grammar", () => {
  it("allows incomplete rules with unknown aesthetics left out", () => {
    const file = parseCaptionRulesFile(
      domainFile([
        {
          id: "caption.demo.quiet-lower-third",
          status: "CANDIDATE",
          rule: "Keep captions visually quiet while a real demo is on screen.",
          prohibited_behaviors: ["Busy multi-line stacking over demo content."],
        },
      ]),
    );
    expect(file.items).toHaveLength(1);
    expect(file.items[0]?.max_lines).toBeUndefined();
  });

  it("rejects ASR-bound or aesthetic-frozen extras via strict schema", () => {
    expect(() =>
      parseCaptionRulesFile(
        domainFile([
          {
            id: "caption.demo.quiet-lower-third",
            status: "CANDIDATE",
            rule: "Keep captions quiet over demos.",
            asr_provider: "funasr",
          },
        ]),
      ),
    ).toThrow();
    expect(() =>
      parseCaptionRulesFile(
        domainFile([
          {
            id: "caption.demo.quiet-lower-third",
            status: "CANDIDATE",
            rule: "Keep captions quiet over demos.",
            font_family: "SomeFont",
          },
        ]),
      ),
    ).toThrow();
  });
});

describe("P9.2B quality gates", () => {
  it("keeps severity HARD independent from lifecycle status", () => {
    // A CANDIDATE rule may already be shaped as a future HARD gate without
    // being an approved REN hard rule.
    const candidateHard = parseQualityGatesFile(
      domainFile([
        {
          id: "quality.proof.no-decorative-cover",
          status: "CANDIDATE",
          severity: "HARD",
          applies_to_roles: ["PROOF"],
          rule: "Never cover spoken evidence with decorative B-roll.",
          reason: "Evidence must stay visible to keep the claim credible.",
        },
      ]),
    );
    expect(candidateHard.items[0]).toMatchObject({ status: "CANDIDATE", severity: "HARD" });

    const frozenAdvisory = parseQualityGatesFile(
      domainFile([
        {
          id: "quality.hook.quiet-open",
          status: "FROZEN",
          severity: "ADVISORY",
          rule: "Prefer a quiet opening frame.",
          reason: "Founder-approved advisory example for schema coverage.",
        },
      ]),
    );
    expect(frozenAdvisory.items[0]).toMatchObject({ status: "FROZEN", severity: "ADVISORY" });

    expect(() =>
      parseQualityGatesFile(
        domainFile([
          {
            id: "quality.proof.no-decorative-cover",
            status: "CANDIDATE",
            severity: "BLOCKING",
            rule: "Never cover evidence.",
            reason: "Credibility.",
          },
        ]),
      ),
    ).toThrow();
  });
});

describe("P9.2B lifecycle invariants and cross-contract validation", () => {
  it("holds mixed lifecycle items inside one domain without a domain status", () => {
    const file = parseEditingGrammarFile(
      domainFile(
        (["UNSET", "CANDIDATE", "OBSERVED", "FROZEN"] as const).map((status, index) => ({
          ...editingRule(),
          id: `editing.proof.mixed-${index + 1}`,
          status,
        })),
      ),
    );
    expect(file.items.map((item) => item.status)).toEqual([
      "UNSET",
      "CANDIDATE",
      "OBSERVED",
      "FROZEN",
    ]);
  });

  it("accepts empty domain files", () => {
    expect(parseEditingGrammarFile(domainFile([])).items).toEqual([]);
    expect(parseVisualGrammarFile(domainFile([])).items).toEqual([]);
    expect(parseMotionLibraryFile(domainFile([])).items).toEqual([]);
    expect(parseCaptionRulesFile(domainFile([])).items).toEqual([]);
    expect(parseQualityGatesFile(domainFile([])).items).toEqual([]);
  });

  it("rejects duplicate item ids", () => {
    expect(() =>
      parseEditingGrammarFile(domainFile([editingRule(), editingRule()])),
    ).toThrow(/unique/);
  });

  it("rejects wrong-namespace ids", () => {
    expect(() =>
      parseEditingGrammarFile(domainFile([editingRule({ id: "visual.proof.real-demo" })])),
    ).toThrow();
    expect(() =>
      parseMotionLibraryFile(
        domainFile([
          {
            id: "editing.proof.real-evidence-first",
            status: "CANDIDATE",
            purpose: "Wrong namespace.",
            implementation_status: "UNSET",
          },
        ]),
      ),
    ).toThrow();
    expect(() =>
      parseQualityGatesFile(
        domainFile([
          {
            id: "caption.demo.quiet-lower-third",
            status: "CANDIDATE",
            severity: "ADVISORY",
            rule: "Wrong namespace.",
            reason: "Schema coverage.",
          },
        ]),
      ),
    ).toThrow();
  });

  it("rejects an arbitrary fifth lifecycle state", () => {
    expect(() =>
      parseEditingGrammarFile(domainFile([editingRule({ status: "AUTO_FROZEN" })])),
    ).toThrow();
  });

  it("treats evidence refs as opaque strings without requiring a reference library", () => {
    const file = parseEditingGrammarFile(
      domainFile([editingRule({ evidence_refs: ["ref_999", "future-inbox-item"] })]),
    );
    expect(file.items[0]?.evidence_refs).toEqual(["ref_999", "future-inbox-item"]);
  });

  it("contains no promotion, aggregation, or learning logic", () => {
    for (const name of Object.keys(styleGrammarModule)) {
      expect(name.toLowerCase()).not.toMatch(/promot/);
      expect(name.toLowerCase()).not.toMatch(/autofreeze|auto_freeze/);
      expect(name.toLowerCase()).not.toMatch(/aggregatestatus|aggregate_status/);
      expect(name.toLowerCase()).not.toMatch(/observeandfreeze|learn/);
    }

    // parsing preserves every status exactly as supplied
    const file = parseEditingGrammarFile(domainFile([editingRule({ status: "OBSERVED" })]));
    expect(file.items[0]?.status).toBe("OBSERVED");
  });

  it("keeps the manifest to presence and path registration only", () => {
    // repository seed manifest declares no domains and no preferences
    const seed = parseStyleManifest({
      style_version: "1.0",
      brand_version: "1.0",
      domains: {},
    });
    expect(seed.domains).toEqual({});

    // domain keys map one-to-one to their file schema and expected path
    expect(Object.keys(styleGrammarFileSchemas).sort()).toEqual(
      Object.keys(styleGrammarFilePaths).sort(),
    );
    const declared = parseStyleManifest({
      style_version: "1.0",
      brand_version: "1.0",
      domains: { "editing-grammar": { path: styleGrammarFilePaths["editing-grammar"] } },
    });
    expect(declared.domains["editing-grammar"]).toEqual({
      path: "style/editing-grammar.json",
    });

    // mismatched pairs are refused: motion content is not an editing grammar
    const motionContent = domainFile([
      {
        id: "motion.keyword-pop",
        status: "UNSET",
        purpose: "Marks a spoken keyword.",
        implementation_status: "UNSET",
      },
    ]);
    expect(() => styleGrammarFileSchemas["editing-grammar"].parse(motionContent)).toThrow();
    expect(() => styleGrammarFileSchemas["motion-library"].parse(motionContent)).not.toThrow();
  });
});
