import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadBrandKit, loadCurrentBrandKit, loadStyleManifest } from "../src/brand/loader.ts";
import {
  parseStyleManifest,
  resolveDomainStatus,
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
    domains: {
      "editing-grammar": { status: "UNSET" },
      "visual-grammar": { status: "UNSET" },
      "motion-library": { status: "UNSET" },
      "caption-rules": { status: "UNSET" },
      "reference-library": { status: "UNSET" },
      "quality-gates": { status: "UNSET" },
    },
  };
}

describe("P9.2A style lifecycle contract", () => {
  it("accepts exactly the four lifecycle statuses", () => {
    expect(styleLifecycleValues).toEqual(["UNSET", "CANDIDATE", "OBSERVED", "FROZEN"]);

    for (const status of styleLifecycleValues) {
      expect(styleLifecycleSchema.parse(status)).toBe(status);
    }
  });

  it("rejects any fifth status", () => {
    expect(() => styleLifecycleSchema.parse("APPROVED")).toThrow();
    expect(() => styleLifecycleSchema.parse("unset")).toThrow();
    expect(() => styleLifecycleSchema.parse("FROZEN_PLUS")).toThrow();
    expect(() =>
      parseStyleManifest({
        ...baseManifest(),
        domains: { "editing-grammar": { status: "AUTO_FROZEN" } },
      }),
    ).toThrow();
  });

  it("treats UNSET as a legal first-class state", () => {
    const manifest = parseStyleManifest(baseManifest());

    for (const domain of styleDomainValues) {
      expect(resolveDomainStatus(manifest, domain)).toBe("UNSET");
    }
  });

  it("validates the manifest version identity", () => {
    expect(parseStyleManifest(baseManifest()).style_version).toBe("1.0");
    expect(() => parseStyleManifest({ ...baseManifest(), style_version: "v1" })).toThrow();
    expect(() => parseStyleManifest({ ...baseManifest(), style_version: "" })).toThrow();
  });

  it("treats missing style domains as UNSET, never as a Founder preference", () => {
    const { domains: _omitted, ...withoutDomains } = baseManifest();
    const manifest = parseStyleManifest(withoutDomains);

    expect(manifest.domains).toEqual({});

    for (const domain of styleDomainValues) {
      const status = resolveDomainStatus(manifest, domain);
      expect(status).toBe("UNSET");
      expect(status).not.toBe("CANDIDATE");
      expect(status).not.toBe("OBSERVED");
      expect(status).not.toBe("FROZEN");
    }
  });

  it("contains no automatic promotion path toward FROZEN", () => {
    for (const moduleExports of [styleContractsModule, brandLoaderModule]) {
      for (const name of Object.keys(moduleExports)) {
        expect(name.toLowerCase()).not.toMatch(/promot/);
      }
    }

    // parsing and loading never upgrade a status behind the caller's back
    const candidate = parseStyleManifest({
      ...baseManifest(),
      domains: { "editing-grammar": { status: "CANDIDATE" } },
    });
    expect(resolveDomainStatus(candidate, "editing-grammar")).toBe("CANDIDATE");
    expect(resolveDomainStatus(candidate, "visual-grammar")).toBe("UNSET");
  });
});

describe("P9.2A style manifest loader boundary", () => {
  it("keeps a brand kit without style files fully loadable", () => {
    const fixtureCwd = createBrandFixtureWithoutStyle();

    expect(loadCurrentBrandKit(fixtureCwd).brand_version).toBe("1.0");
    expect(loadBrandKit("1.0", fixtureCwd).brand_version).toBe("1.0");
    expect(loadStyleManifest("1.0", fixtureCwd)).toBeUndefined();
  });

  it("loads the repository seed manifest as all-UNSET", () => {
    const manifest = loadStyleManifest("1.0");

    expect(manifest?.style_version).toBe("1.0");
    expect(manifest?.brand_version).toBe("1.0");
    for (const domain of styleDomainValues) {
      expect(manifest === undefined ? undefined : resolveDomainStatus(manifest, domain)).toBe("UNSET");
    }
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
