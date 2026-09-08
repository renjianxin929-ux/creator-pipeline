import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadStyleOS } from "../src/brand/style-os.ts";
import {
  selectDurableTruth,
  selectItemsByStatus,
} from "../src/contracts/index.ts";
import * as styleOsModule from "../src/brand/style-os.ts";
import * as styleSnapshotModule from "../src/contracts/style-snapshot.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function copyRepoBrand(): string {
  const cwd = mkdtempSync(join(tmpdir(), "creator-pipeline-styleos-test-"));
  temporaryDirectories.push(cwd);
  cpSync(join(process.cwd(), "brand"), join(cwd, "brand"), { recursive: true });
  return cwd;
}

function styleDirectory(cwd: string): string {
  return join(cwd, "brand", "v1.0", "style");
}

function writeManifest(cwd: string, domains: Record<string, { path: string }>): void {
  writeFileSync(
    join(styleDirectory(cwd), "manifest.json"),
    JSON.stringify({ style_version: "1.0", brand_version: "1.0", domains }, null, 2),
    "utf8",
  );
}

function writeStyleFile(cwd: string, name: string, content: unknown): void {
  writeFileSync(join(styleDirectory(cwd), name), JSON.stringify(content, null, 2), "utf8");
}

function editingFile(items: unknown[]) {
  return { version: 1, style_version: "1.0", items };
}

describe("P9.2D manifest-driven loading", () => {
  it("loads an empty Style OS without inventing preferences", () => {
    const cwd = copyRepoBrand();
    writeManifest(cwd, {});
    for (const name of [
      "editing-grammar.json",
      "visual-grammar.json",
      "motion-library.json",
      "caption-rules.json",
      "quality-gates.json",
      "references.json",
      "reference-inbox.json",
    ]) {
      rmSync(join(styleDirectory(cwd), name), { force: true });
    }

    const snapshot = loadStyleOS("1.0", cwd);
    expect(snapshot.style_version).toBe("1.0");
    expect(snapshot.brand_version).toBe("1.0");
    expect(snapshot.editing_grammar.items).toEqual([]);
    expect(snapshot.visual_grammar.items).toEqual([]);
    expect(snapshot.motion_library.items).toEqual([]);
    expect(snapshot.caption_rules.items).toEqual([]);
    expect(snapshot.quality_gates.items).toEqual([]);
    expect(snapshot.references.items).toEqual([]);
    expect(snapshot.reference_inbox.items).toEqual([]);
  });

  it("loads a kit without any manifest as explicit absence", () => {
    const cwd = copyRepoBrand();
    rmSync(join(styleDirectory(cwd)), { recursive: true, force: true });

    const snapshot = loadStyleOS("1.0", cwd);
    expect(snapshot.editing_grammar.items).toEqual([]);
    expect(snapshot.reference_inbox.items).toEqual([]);
  });

  it("loads the manifest-declared editing grammar", () => {
    const snapshot = loadStyleOS("1.0", copyRepoBrand());
    expect(snapshot.editing_grammar.items).toHaveLength(1);
    expect(snapshot.editing_grammar.items[0]).toMatchObject({
      id: "editing.proof.real-evidence-first",
      status: "CANDIDATE",
    });
  });

  it("rejects a manifest domain/path mismatch", () => {
    const cwd = copyRepoBrand();
    writeManifest(cwd, { "editing-grammar": { path: "style/motion-library.json" } });

    expect(() => loadStyleOS("1.0", cwd)).toThrow(/path mismatch/);
  });

  it("rejects a declared domain file with a mismatched style_version", () => {
    const cwd = copyRepoBrand();
    writeStyleFile(cwd, "editing-grammar.json", {
      ...editingFile([]),
      style_version: "1.1",
    });

    expect(() => loadStyleOS("1.0", cwd)).toThrow(/version mismatch/);
  });

  it("treats undeclared domains as legal empty absence", () => {
    const cwd = copyRepoBrand();
    writeManifest(cwd, { "editing-grammar": { path: "style/editing-grammar.json" } });
    for (const name of [
      "visual-grammar.json",
      "motion-library.json",
      "caption-rules.json",
      "quality-gates.json",
      "references.json",
      "reference-inbox.json",
    ]) {
      rmSync(join(styleDirectory(cwd), name), { force: true });
    }

    const snapshot = loadStyleOS("1.0", cwd);
    expect(snapshot.editing_grammar.items).toHaveLength(1);
    expect(snapshot.visual_grammar.items).toEqual([]);
    expect(snapshot.references.items).toEqual([]);
    expect(snapshot.reference_inbox.items).toEqual([]);
  });

  it("fails closed on an invalid declared domain file", () => {
    const cwd = copyRepoBrand();
    writeFileSync(join(styleDirectory(cwd), "editing-grammar.json"), "{not-json", "utf8");

    expect(() => loadStyleOS("1.0", cwd)).toThrow();
  });

  it("fails closed on a declared but missing domain file", () => {
    const cwd = copyRepoBrand();
    rmSync(join(styleDirectory(cwd), "editing-grammar.json"), { force: true });

    expect(() => loadStyleOS("1.0", cwd)).toThrow(/does not exist/);
  });
});

describe("P9.2D reference loading", () => {
  it("loads the declared reference library", () => {
    const cwd = copyRepoBrand();
    writeStyleFile(cwd, "references.json", {
      version: 1,
      style_version: "1.0",
      items: [
        {
          id: "ref_001",
          source: "https://example.com/clip",
          category: "proof-transition",
          description: "Speaker holds, then the view cuts to the real screen.",
          founder_note: "切 Demo 的感觉不错",
          why_saved: "Evidence lands exactly with the claim.",
          reusable_aspects: ["pacing"],
          status: "CANDIDATE",
          provenance: "FOUNDER",
        },
      ],
    });

    const snapshot = loadStyleOS("1.0", cwd);
    expect(snapshot.references.items).toHaveLength(1);
    expect(snapshot.references.items[0]?.id).toBe("ref_001");
  });

  it("resolves a missing inbox to an empty list", () => {
    const cwd = copyRepoBrand();
    rmSync(join(styleDirectory(cwd), "reference-inbox.json"), { force: true });

    expect(loadStyleOS("1.0", cwd).reference_inbox.items).toEqual([]);
  });

  it("loads a captured inbox item", () => {
    const cwd = copyRepoBrand();
    writeStyleFile(cwd, "reference-inbox.json", {
      version: 1,
      style_version: "1.0",
      items: [
        {
          id: "inbox_001",
          source: "https://example.com/clip",
          founder_note: "这里从人物切到 Demo 的感觉不错",
          status: "UNANALYZED",
        },
      ],
    });

    const snapshot = loadStyleOS("1.0", cwd);
    expect(snapshot.reference_inbox.items).toHaveLength(1);
  });
});

describe("P9.2D lifecycle preservation and query boundary", () => {
  it("preserves every stored lifecycle status exactly", () => {
    const cwd = copyRepoBrand();
    writeStyleFile(
      cwd,
      "editing-grammar.json",
      editingFile(
        (["UNSET", "CANDIDATE", "OBSERVED", "FROZEN"] as const).map((status, index) => ({
          id: `editing.proof.seed-${index + 1}`,
          status,
          applies_to: ["PROOF"],
          rule: `Seed rule ${index + 1}.`,
          allowed_visuals: ["visual.proof.real-demo"],
          why: "Schema coverage.",
        })),
      ),
    );

    const snapshot = loadStyleOS("1.0", cwd);
    expect(snapshot.editing_grammar.items.map((item) => item.status)).toEqual([
      "UNSET",
      "CANDIDATE",
      "OBSERVED",
      "FROZEN",
    ]);
  });

  it("reads UNSET items explicitly without treating them as truth", () => {
    const cwd = copyRepoBrand();
    const snapshot = loadStyleOS("1.0", cwd);

    const unsetMotion = selectItemsByStatus(snapshot.motion_library.items, "UNSET");
    expect(unsetMotion).toHaveLength(1);
    expect(selectDurableTruth(snapshot.motion_library.items)).toEqual([]);
  });

  it("reads each lifecycle status separately", () => {
    const cwd = copyRepoBrand();
    writeStyleFile(
      cwd,
      "editing-grammar.json",
      editingFile(
        (["UNSET", "CANDIDATE", "OBSERVED", "FROZEN"] as const).map((status, index) => ({
          id: `editing.proof.status-${index + 1}`,
          status,
          applies_to: ["PROOF"],
          rule: `Status probe ${index + 1}.`,
          allowed_visuals: ["visual.proof.real-demo"],
          why: "Schema coverage.",
        })),
      ),
    );
    const snapshot = loadStyleOS("1.0", cwd);

    for (const status of ["UNSET", "CANDIDATE", "OBSERVED", "FROZEN"] as const) {
      expect(selectItemsByStatus(snapshot.editing_grammar.items, status)).toHaveLength(1);
    }
    expect(selectDurableTruth(snapshot.editing_grammar.items).map((item) => item.id)).toEqual([
      "editing.proof.status-4",
    ]);
  });

  it("keeps CANDIDATE and OBSERVED out of durable truth", () => {
    const snapshot = loadStyleOS("1.0", copyRepoBrand());

    expect(selectDurableTruth(snapshot.editing_grammar.items)).toEqual([]);
    expect(selectItemsByStatus(snapshot.editing_grammar.items, "CANDIDATE")).toHaveLength(1);
    expect(selectItemsByStatus(snapshot.editing_grammar.items, "OBSERVED")).toHaveLength(0);
  });

  it("keeps a FROZEN reference from mutating linked rule status", () => {
    const cwd = copyRepoBrand();
    writeStyleFile(cwd, "references.json", {
      version: 1,
      style_version: "1.0",
      items: [
        {
          id: "ref_009",
          source: "https://example.com/clip",
          category: "proof-transition",
          description: "Claim then evidence.",
          founder_note: "Good.",
          why_saved: "Timing.",
          reusable_aspects: ["pacing"],
          linked_editing_rule_ids: ["editing.proof.real-evidence-first"],
          status: "FROZEN",
          provenance: "FOUNDER",
        },
      ],
    });

    const snapshot = loadStyleOS("1.0", cwd);
    expect(snapshot.references.items[0]?.status).toBe("FROZEN");
    expect(snapshot.editing_grammar.items[0]?.status).toBe("CANDIDATE");
  });

  it("contains no cascade, promotion, or planner logic", () => {
    for (const moduleExports of [styleOsModule, styleSnapshotModule]) {
      for (const name of Object.keys(moduleExports)) {
        expect(name.toLowerCase()).not.toMatch(/promot/);
        expect(name.toLowerCase()).not.toMatch(/learn|cascade/);
        expect(name.toLowerCase()).not.toMatch(/choose|apply|rank|generate|plan/);
      }
    }
  });
});

describe("P9.2D determinism and immutability", () => {
  it("resolves deterministically from the same files", () => {
    const cwd = copyRepoBrand();
    expect(loadStyleOS("1.0", cwd)).toEqual(loadStyleOS("1.0", cwd));
  });

  it("prevents caller mutation from altering subsequent loads", () => {
    const cwd = copyRepoBrand();
    const snapshot = loadStyleOS("1.0", cwd);

    expect(() => {
      (snapshot as { style_version: string }).style_version = "9.9";
    }).toThrow();
    expect(() => {
      (snapshot.editing_grammar.items as unknown[]).push({ id: "editing.hacked.rule" });
    }).toThrow();

    expect(loadStyleOS("1.0", cwd).style_version).toBe("1.0");
    expect(loadStyleOS("1.0", cwd).editing_grammar.items).toHaveLength(1);
  });
});

describe("P9.2D neutral seed", () => {
  it("ships minimal seed without claiming Founder approval", () => {
    const snapshot = loadStyleOS("1.0");

    expect(snapshot.editing_grammar.items).toHaveLength(1);
    expect(snapshot.editing_grammar.items[0]).toMatchObject({
      id: "editing.proof.real-evidence-first",
      status: "CANDIDATE",
    });

    expect(snapshot.visual_grammar.items).toHaveLength(1);
    expect(snapshot.visual_grammar.items[0]).toMatchObject({
      id: "visual.proof.real-demo",
      status: "CANDIDATE",
      implementation_status: "UNSET",
    });

    expect(snapshot.motion_library.items).toHaveLength(1);
    expect(snapshot.motion_library.items[0]).toMatchObject({
      id: "motion.keyword-pop",
      status: "UNSET",
      implementation_status: "UNSET",
    });

    expect(snapshot.caption_rules.items).toEqual([]);

    expect(snapshot.quality_gates.items).toHaveLength(1);
    expect(snapshot.quality_gates.items[0]).toMatchObject({
      id: "quality.proof.no-decorative-cover",
      status: "CANDIDATE",
    });
    expect(
      snapshot.quality_gates.items.every((item) => item.status !== "FROZEN"),
    ).toBe(true);

    expect(snapshot.references.items).toEqual([]);
    expect(snapshot.reference_inbox.items).toEqual([]);
  });
});
