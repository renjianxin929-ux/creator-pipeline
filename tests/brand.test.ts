import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadBrandKit, loadCurrentBrandKit } from "../src/brand/loader.ts";
import {
  brandOverrideSchema,
  projectIdentitySchema,
  resolveBrand,
  resolveBrandTemplates,
} from "../src/contracts/index.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("P3 brand contract", () => {
  it("rejects overrides that attempt to invent official tokens", () => {
    expect(() =>
      brandOverrideSchema.parse({
        colors: {
          accent: "#ef4444",
          invented: "#000000",
        },
      }),
    ).toThrow();
  });

  it("resolves into a new snapshot without mutating the versioned kit", () => {
    const kit = loadCurrentBrandKit();
    const kitBefore = JSON.stringify(kit);

    const resolved = resolveBrand(kit, {
      colors: { accent: "#ef4444" },
      caption_max_lines: 3,
    });

    expect(resolved.tokens.colors.accent).toBe("#ef4444");
    expect(resolved.defaults.caption_max_lines).toBe(3);
    expect(JSON.stringify(kit)).toBe(kitBefore);
  });
});

describe("P3 versioned kit loader", () => {
  it("loads v1.0 and clearly rejects a missing version", () => {
    const fixtureCwd = createBrandFixture();

    expect(loadCurrentBrandKit(fixtureCwd).brand_version).toBe("1.0");
    expect(() => loadBrandKit("1.1", fixtureCwd)).toThrow("Brand kit version does not exist: 1.1");
  });

  it("loads a temporary v1.1 whose only token change is accent color", () => {
    const fixtureCwd = createBrandFixture();
    createV11Fixture(fixtureCwd, "#ef4444");

    const v10 = loadBrandKit("1.0", fixtureCwd);
    const v11 = loadBrandKit("1.1", fixtureCwd);

    expect(v11.tokens.colors.accent).toBe("#ef4444");
    expect({ ...v11.tokens.colors, accent: v10.tokens.colors.accent }).toEqual(v10.tokens.colors);
    expect(v11.tokens.typography).toEqual(v10.tokens.typography);
    expect(v11.tokens.spacing).toEqual(v10.tokens.spacing);
    expect(v11.tokens.safe_area).toEqual(v10.tokens.safe_area);
    expect(v11.templates).toEqual(v10.templates);
    expect(v11.defaults).toEqual(v10.defaults);
  });

  it("keeps a project snapshot stable across versions except for the changed tokens", () => {
    const fixtureCwd = createBrandFixture();
    createV11Fixture(fixtureCwd, "#ef4444");
    const project = projectIdentitySchema.parse({
      id: "project-brand-test",
      slug: "brand-test",
      created_at: "2026-08-30T00:00:00.000Z",
      brand_version: "1.0",
      brand_override: { caption_max_lines: 3 },
      brand_templates: { layout: "layout.screen-demo" },
      budget: {
        generation_cash_cny: 10,
        used_cash_cny: 0,
        subscription_generation_count: 0,
      },
    });

    const resolvedV10 = resolveSnapshot(project, loadBrandKit("1.0", fixtureCwd));
    const resolvedV11 = resolveSnapshot(project, loadBrandKit("1.1", fixtureCwd));

    expect(resolvedV10.defaults).toEqual(resolvedV11.defaults);
    expect(resolvedV10.templates).toEqual(resolvedV11.templates);
    expect({ ...resolvedV11.tokens.colors, accent: resolvedV10.tokens.colors.accent }).toEqual(
      resolvedV10.tokens.colors,
    );
    expect(resolvedV11.tokens.typography).toEqual(resolvedV10.tokens.typography);
    expect(resolvedV11.tokens.spacing).toEqual(resolvedV10.tokens.spacing);
    expect(resolvedV11.tokens.safe_area).toEqual(resolvedV10.tokens.safe_area);
  });
});

function resolveSnapshot(
  project: ReturnType<typeof projectIdentitySchema.parse>,
  kit: ReturnType<typeof loadBrandKit>,
) {
  return resolveBrandTemplates(resolveBrand(kit, project.brand_override), project.brand_templates);
}

function createBrandFixture(): string {
  const cwd = mkdtempSync(join(tmpdir(), "creator-pipeline-brand-test-"));
  temporaryDirectories.push(cwd);
  cpSync(join(process.cwd(), "brand"), join(cwd, "brand"), { recursive: true });
  return cwd;
}

function createV11Fixture(cwd: string, accent: string): void {
  const sourceDirectory = join(cwd, "brand", "v1.0");
  const versionDirectory = join(cwd, "brand", "v1.1");
  cpSync(sourceDirectory, versionDirectory, { recursive: true });

  const manifestPath = join(versionDirectory, "brand.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { brand_version: string };
  manifest.brand_version = "1.1";
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const colorsPath = join(versionDirectory, "tokens", "colors.json");
  const colors = JSON.parse(readFileSync(colorsPath, "utf8")) as Record<string, string>;
  colors.accent = accent;
  writeFileSync(colorsPath, `${JSON.stringify(colors, null, 2)}\n`, "utf8");
}
