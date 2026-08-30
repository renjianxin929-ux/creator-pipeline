import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import {
  brandDefaultsSchema,
  brandKitSchema,
  brandTemplateRegistrySchema,
  brandVersionSchema,
  colorTokensSchema,
  safeAreaTokensSchema,
  spacingTokensSchema,
  typographyTokensSchema,
  type BrandKit,
} from "../contracts/index.js";

const brandPointerSchema = z
  .object({
    version: brandVersionSchema,
  })
  .strict();

const brandManifestSchema = z
  .object({
    brand_version: brandVersionSchema,
    templates: brandTemplateRegistrySchema,
    defaults: brandDefaultsSchema,
  })
  .strict();

export class BrandKitError extends Error {
  override name = "BrandKitError";
}

/** Resolves the repository-level versioned brand directory. */
export function resolveBrandRoot(cwd = process.cwd()): string {
  return resolve(cwd, "brand");
}

/** Reads the current pointer and returns its versioned, validated kit. */
export function loadCurrentBrandKit(cwd = process.cwd()): BrandKit {
  const brandRoot = resolveBrandRoot(cwd);
  const pointer = readBrandJson(join(brandRoot, "current.json"), brandPointerSchema);

  return loadBrandKit(pointer.version, cwd);
}

/**
 * Reads one immutable version from disk. The returned object is a fresh parsed
 * snapshot; the loader never writes to the kit directory.
 */
export function loadBrandKit(versionInput: string, cwd = process.cwd()): BrandKit {
  const version = parseBrandVersion(versionInput);
  const brandRoot = resolveBrandRoot(cwd);
  const versionDirectory = join(brandRoot, `v${version}`);

  if (!existsSync(versionDirectory)) {
    throw new BrandKitError(`Brand kit version does not exist: ${version}`);
  }

  const manifest = readBrandJson(join(versionDirectory, "brand.json"), brandManifestSchema);
  if (manifest.brand_version !== version) {
    throw new BrandKitError(
      `Brand kit version mismatch: requested ${version}, found ${manifest.brand_version}`,
    );
  }

  return parseBrandKit({
    brand_version: manifest.brand_version,
    tokens: {
      colors: readBrandJson(join(versionDirectory, "tokens", "colors.json"), colorTokensSchema),
      typography: readBrandJson(
        join(versionDirectory, "tokens", "typography.json"),
        typographyTokensSchema,
      ),
      spacing: readBrandJson(join(versionDirectory, "tokens", "spacing.json"), spacingTokensSchema),
      safe_area: readBrandJson(
        join(versionDirectory, "tokens", "safe-area.json"),
        safeAreaTokensSchema,
      ),
    },
    templates: manifest.templates,
    defaults: manifest.defaults,
  });
}

function parseBrandVersion(versionInput: string): string {
  const parsed = brandVersionSchema.safeParse(versionInput);
  if (!parsed.success) {
    throw new BrandKitError(`Invalid brand version: ${versionInput}`);
  }

  return parsed.data;
}

function parseBrandKit(input: unknown): BrandKit {
  const parsed = brandKitSchema.safeParse(input);
  if (!parsed.success) {
    throw new BrandKitError("Brand kit does not satisfy the brand contract");
  }

  return parsed.data;
}

function readBrandJson<TSchema extends z.ZodTypeAny>(path: string, schema: TSchema): z.infer<TSchema> {
  if (!existsSync(path)) {
    throw new BrandKitError(`Brand file does not exist: ${path}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new BrandKitError(`Unable to read valid JSON from brand file: ${path}`);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new BrandKitError(`Brand file does not satisfy its contract: ${path}`);
  }

  return parsed.data;
}
