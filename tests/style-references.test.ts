import { describe, expect, it } from "vitest";

import { loadStyleManifest } from "../src/brand/loader.ts";
import {
  parseReferenceInboxFile,
  parseReferencesFile,
  parseStyleManifest,
  REFERENCE_INBOX_RELATIVE_PATH,
  REFERENCES_RELATIVE_PATH,
} from "../src/contracts/index.ts";
import * as styleReferencesModule from "../src/contracts/style-references.ts";

function inboxFile(items: unknown[]) {
  return { version: 1, style_version: "1.0", items };
}

function referenceItem(overrides = {}) {
  return {
    id: "ref_001",
    source: "https://example.com/video",
    category: "proof-transition",
    description: "The speaker holds a claim, then the view cuts to the real product screen.",
    founder_note: "这里从人物切到 Demo 的感觉不错",
    why_saved: "Evidence arrives exactly when the claim lands, without decoration.",
    reusable_aspects: ["pacing", "proof transition"],
    do_not_copy: ["typography", "color palette"],
    linked_editing_rule_ids: ["editing.proof.real-evidence-first"],
    linked_visual_ids: ["visual.proof.real-demo"],
    linked_motion_ids: ["motion.evidence-highlight"],
    status: "CANDIDATE",
    provenance: "FOUNDER",
    ...overrides,
  };
}

function referencesFile(items: unknown[]) {
  return { version: 1, style_version: "1.0", items };
}

describe("P9.2C reference inbox", () => {
  it("accepts the minimal Founder capture", () => {
    const file = parseReferenceInboxFile(
      inboxFile([
        {
          id: "inbox_001",
          source: "https://example.com/clip",
          founder_note: "这里从人物切到 Demo 的感觉不错",
          status: "UNANALYZED",
        },
      ]),
    );
    expect(file.items).toHaveLength(1);
  });

  it("keeps timestamps optional", () => {
    const file = parseReferenceInboxFile(
      inboxFile([
        {
          id: "inbox_002",
          source: "local captures/still-04.png",
          founder_note: "Static frame with a clean focal point.",
          status: "UNANALYZED",
        },
        {
          id: "inbox_003",
          source: "An article about title cards.",
          timestamp_start: "00:18",
          timestamp_end: "00:25",
          founder_note: "I like how this switches from speaker to demo.",
          status: "ANALYZED",
        },
      ]),
    );
    expect(file.items).toHaveLength(2);
    expect(file.items[0]?.timestamp_start).toBeUndefined();
  });

  it("rejects invalid timestamp ranges", () => {
    expect(() =>
      parseReferenceInboxFile(
        inboxFile([
          {
            id: "inbox_004",
            source: "https://example.com/clip",
            timestamp_start: "00:25",
            timestamp_end: "00:18",
            founder_note: "Inverted range.",
            status: "UNANALYZED",
          },
        ]),
      ),
    ).toThrow(/timestamp_end/);

    expect(() =>
      parseReferenceInboxFile(
        inboxFile([
          {
            id: "inbox_005",
            source: "https://example.com/clip",
            timestamp_start: "not-a-time",
            founder_note: "Bad format.",
            status: "UNANALYZED",
          },
        ]),
      ),
    ).toThrow();
  });

  it("rejects duplicate inbox ids", () => {
    const item = {
      id: "inbox_006",
      source: "https://example.com/a",
      founder_note: "First.",
      status: "UNANALYZED",
    };
    expect(() =>
      parseReferenceInboxFile(inboxFile([item, { ...item, source: "https://example.com/b" }])),
    ).toThrow(/unique/);
  });

  it("requires no taxonomy, roles, or rule links on inbox items", () => {
    // minimal input passes without category, roles, or links
    expect(() =>
      parseReferenceInboxFile(
        inboxFile([
          { id: "inbox_007", source: "x", founder_note: "Good.", status: "UNANALYZED" },
        ]),
      ),
    ).not.toThrow();

    // taxonomy belongs to the library, not the capture surface
    expect(() =>
      parseReferenceInboxFile(
        inboxFile([
          {
            id: "inbox_008",
            source: "x",
            founder_note: "Good.",
            status: "UNANALYZED",
            semantic_role: "PROOF",
          },
        ]),
      ),
    ).toThrow();
  });

  it("keeps inbox capture state separate from the style lifecycle", () => {
    for (const status of ["UNSET", "CANDIDATE", "OBSERVED", "FROZEN"]) {
      expect(() =>
        parseReferenceInboxFile(
          inboxFile([{ id: "inbox_009", source: "x", founder_note: "Good.", status }]),
        ),
      ).toThrow();
    }
  });

  it("accepts an empty inbox", () => {
    expect(parseReferenceInboxFile(inboxFile([])).items).toEqual([]);
  });
});

describe("P9.2C reference library", () => {
  it("accepts a formal analyzed reference", () => {
    const file = parseReferencesFile(referencesFile([referenceItem()]));
    expect(file.items).toHaveLength(1);
    expect(file.items[0]?.provenance).toBe("FOUNDER");
  });

  it("records do_not_copy as a first-class boundary", () => {
    const file = parseReferencesFile(
      referencesFile([
        referenceItem({
          reusable_aspects: ["pacing", "proof transition"],
          do_not_copy: ["typography", "color palette", "transitions"],
        }),
      ]),
    );
    expect(file.items[0]?.reusable_aspects).toEqual(["pacing", "proof transition"]);
    expect(file.items[0]?.do_not_copy).toEqual(["typography", "color palette", "transitions"]);
  });

  it("never upgrades AGENT_ANALYSIS into approved style truth", () => {
    const file = parseReferencesFile(
      referencesFile([
        referenceItem({ id: "ref_002", status: "CANDIDATE", provenance: "AGENT_ANALYSIS" }),
      ]),
    );
    expect(file.items[0]).toMatchObject({ status: "CANDIDATE", provenance: "AGENT_ANALYSIS" });

    // a FROZEN reference stays attached to its own record; parsing performs
    // no promotion and touches no linked rule
    const frozen = parseReferencesFile(
      referencesFile([referenceItem({ id: "ref_003", status: "FROZEN" })]),
    );
    expect(frozen.items[0]?.status).toBe("FROZEN");
    expect(frozen.items[0]?.linked_editing_rule_ids).toEqual(["editing.proof.real-evidence-first"]);
    expect(JSON.stringify(frozen)).not.toMatch(/promot/i);
  });

  it("validates linked ids against the existing P9.1/P9.2B schemas", () => {
    expect(() =>
      parseReferencesFile(
        referencesFile([
          referenceItem({
            linked_editing_rule_ids: ["editing.proof.real-evidence-first"],
            linked_visual_ids: ["visual.proof.real-demo"],
            linked_motion_ids: ["motion.evidence-highlight"],
            linked_caption_rule_ids: ["caption.demo.quiet-lower-third"],
          }),
        ]),
      ),
    ).not.toThrow();

    // dangling links are legal: P9.2C performs no existence resolution
    expect(() =>
      parseReferencesFile(
        referencesFile([referenceItem({ linked_editing_rule_ids: ["editing.future.not-yet-written"] })]),
      ),
    ).not.toThrow();
  });

  it("rejects wrong-namespace linked ids", () => {
    expect(() =>
      parseReferencesFile(
        referencesFile([referenceItem({ linked_editing_rule_ids: ["visual.proof.real-demo"] })]),
      ),
    ).toThrow();
    expect(() =>
      parseReferencesFile(
        referencesFile([referenceItem({ linked_visual_ids: ["editing.proof.real-evidence-first"] })]),
      ),
    ).toThrow();
    expect(() =>
      parseReferencesFile(
        referencesFile([referenceItem({ linked_motion_ids: ["motion.claude-highlight"] })]),
      ),
    ).toThrow();
  });

  it("rejects duplicate reference ids and arbitrary lifecycle states", () => {
    expect(() =>
      parseReferencesFile(referencesFile([referenceItem(), referenceItem()])),
    ).toThrow(/unique/);
    expect(() =>
      parseReferencesFile(referencesFile([referenceItem({ status: "AUTO_FROZEN" })])),
    ).toThrow();
  });

  it("accepts an empty library", () => {
    expect(parseReferencesFile(referencesFile([])).items).toEqual([]);
  });

  it("contains no promotion or learning logic", () => {
    for (const name of Object.keys(styleReferencesModule)) {
      expect(name.toLowerCase()).not.toMatch(/promot/);
      expect(name.toLowerCase()).not.toMatch(/analyz.*inbox|inbox.*analyz/);
      expect(name.toLowerCase()).not.toMatch(/learn|freeze|observ/);
    }
  });
});

describe("P9.2C manifest registration", () => {
  it("registers the library as domain presence without touching lifecycle", () => {
    const manifest = parseStyleManifest({
      style_version: "1.0",
      brand_version: "1.0",
      domains: { "reference-library": { path: REFERENCES_RELATIVE_PATH } },
    });
    expect(manifest.domains["reference-library"]).toEqual({ path: "style/references.json" });
    expect(JSON.stringify(manifest)).not.toMatch(/UNSET|CANDIDATE|OBSERVED|FROZEN/);
  });

  it("does not turn the inbox into a lifecycle domain", () => {
    expect(REFERENCE_INBOX_RELATIVE_PATH).toBe("style/reference-inbox.json");
    expect(() =>
      parseStyleManifest({
        style_version: "1.0",
        brand_version: "1.0",
        domains: { "reference-inbox": { path: REFERENCE_INBOX_RELATIVE_PATH } },
      }),
    ).toThrow();
  });

  it("leaves the repository seed manifest untouched", () => {
    expect(loadStyleManifest("1.0")?.domains).toEqual({});
  });
});
