import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadBrandKit, loadCurrentBrandKit, loadStyleManifest } from "../src/brand/loader.ts";
import {
  parseStyleManifest,
  styleDomainValues,
  styleLifecycleSchema,
  styleLifecycleValues,
} from "../src/contracts/index.ts";
import * as brandLoaderModule from "../src/brand/loader.ts";
import * as styleContractsModule from "../src/contracts/style-lifecycle.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function baseManifest() {
  return {
    style_version: "1.0",
    brand_version: "1.0",
    domains: {},
  };
}

describe("P9.2A style lifecycle contract", () => {
  it("accepts exactly the four lifecycle statuses for future style items", () => {
    expect(styleLifecycleValues).toEqual(["UNSET", "CANDIDATE", "OBSERVED", "FROZEN"]);

    for (const status of styleLifecycleValues) {
      expect(styleLifecycleSchema.parse(status)).toBe(status);
    }
  });

  it("rejects any fifth status", () => {
    expect(() => styleLifecycleSchema.parse("APPROVED")).toThrow();
    expect(() => styleLifecycleSchema.parse("unset")).toThrow();
    expect(() => styleLifecycleSchema.parse("FROZEN_PLUS")).toThrow();
  });

  it("keeps domain slots free of lifecycle judgment", () => {
    const manifest = parseStyleManifest({
      ...baseManifest(),
      domains: { "editing-grammar": { path: "style/editing-grammar.json" } },
    });
    expect(manifest.domains["editing-grammar"]).toEqual({ path: "style/editing-grammar.json" });

    // a lifecycle status on a domain slot is not a legal manifest
    expect(() =>
      parseStyleManifest({
        ...baseManifest(),
        domains: { "editing-grammar": { status: "FROZEN" } },
      }),
    ).toThrow();
    expect(() =>
      parseStyleManifest({
        ...baseManifest(),
        domains: { "editing-grammar": { status: "UNSET" } },
      }),
    ).toThrow();
  });

  it("constrains domain paths to vendor-neutral style-relative files", () => {
    expect(() =>
      parseStyleManifest({
        ...baseManifest(),
        domains: { "motion-library": { path: "../motion.json" } },
      }),
    ).toThrow();
    expect(() =>
      parseStyleManifest({
        ...baseManifest(),
        domains: { "motion-library": { path: "style/hyperframes_motion.json" } },
      }),
    ).toThrow();
    expect(() =>
      parseStyleManifest({
        ...baseManifest(),
        domains: { "motion-library": { path: "style/motion.claude.json" } },
      }),
    ).toThrow();
  });

  it("treats empty and missing domains as legal", () => {
    expect(parseStyleManifest(baseManifest()).domains).toEqual({});

    const { domains: _omitted, ...withoutDomains } = baseManifest();
    expect(parseStyleManifest(withoutDomains).domains).toEqual({});
  });

  it("lets the manifest express presence only, never a Founder preference", () => {
    const manifest = parseStyleManifest({
      ...baseManifest(),
      domains: {
        "editing-grammar": { path: "style/editing-grammar.json" },
        "quality-gates": { path: "style/quality-gates.json" },
      },
    });

    // presence declares where a domain file lives; it claims nothing about
    // Founder approval, so no lifecycle value may appear anywhere
    expect(JSON.stringify(manifest)).not.toMatch(/UNSET|CANDIDATE|OBSERVED|FROZEN/);
    expect(Object.keys(manifest.domains)).toEqual(["editing-grammar", "quality-gates"]);

    for (const domain of styleDomainValues) {
      if (domain !== "editing-grammar" && domain !== "quality-gates") {
        expect(manifest.domains[domain]).toBeUndefined();
      }
    }
  });

  it("contains no automatic promotion path toward FROZEN", () => {
    for (const moduleExports of [styleContractsModule, brandLoaderModule]) {
      for (const name of Object.keys(moduleExports)) {
        expect(name.toLowerCase()).not.toMatch(/promot/);
        expect(name.toLowerCase()).not.toMatch(/aggregate.*status|status.*aggregate/);
      }
    }

    // parsing never upgrades or annotates behind the caller's back
    const manifest = parseStyleManifest({
      ...baseManifest(),
      domains: { "editing-grammar": { path: "style/editing-grammar.json" } },
    });
    expect(manifest).toEqual({
      style_version: "1.0",
      brand_version: "1.0",
      domains: { "editing-grammar": { path: "style/editing-grammar.json" } },
    });
  });
});

describe("P9.2A style manifest loader boundary", () => {
  it("keeps a brand kit without style files fully loadable", () => {
    const fixtureCwd = createBrandFixtureWithoutStyle();

    expect(loadCurrentBrandKit(fixtureCwd).brand_version).toBe("1.0");
    expect(loadBrandKit("1.0", fixtureCwd).brand_version).toBe("1.0");
    expect(loadStyleManifest("1.0", fixtureCwd)).toBeUndefined();
  });

  it("loads the repository seed manifest as presence-only", () => {
    const manifest = loadStyleManifest("1.0");

    expect(manifest?.style_version).toBe("1.0");
    expect(manifest?.brand_version).toBe("1.0");
    expect(manifest?.domains).toEqual({});
    expect(JSON.stringify(manifest)).not.toMatch(/UNSET|CANDIDATE|OBSERVED|FROZEN/);
  });

  it("rejects mismatched versions and invalid JSON at the loader boundary", () => {
    const fixtureCwd = createBrandFixtureWithStyle();

    writeFileSync(
      join(fixtureCwd, "brand", "v1.0", "style", "manifest.json"),
      JSON.stringify({ ...baseManifest(), brand_version: "1.1" }),
      "utf8",
    );
    expect(() => loadStyleManifest("1.0", fixtureCwd)).toThrow("brand version mismatch");

    writeFileSync(join(fixtureCwd, "brand", "v1.0", "style", "manifest.json"), "{not-json", "utf8");
    expect(() => loadStyleManifest("1.0", fixtureCwd)).toThrow("Unable to read valid JSON");
  });
});

function createBrandFixtureWithStyle(): string {
  const cwd = mkdtempSync(join(tmpdir(), "creator-pipeline-style-test-"));
  temporaryDirectories.push(cwd);
  cpSync(join(process.cwd(), "brand"), join(cwd, "brand"), { recursive: true });
  return cwd;
}

function createBrandFixtureWithoutStyle(): string {
  const cwd = createBrandFixtureWithStyle();
  rmSync(join(cwd, "brand", "v1.0", "style"), { recursive: true, force: true });
  return cwd;
}
