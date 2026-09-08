import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  emptyDomainFile,
  parseStyleOsSnapshot,
  type StyleOsSnapshot,
} from "../contracts/index.js";
import {
  REFERENCE_INBOX_RELATIVE_PATH,
  referenceInboxFileSchema,
  REFERENCES_RELATIVE_PATH,
  referencesFileSchema,
  styleGrammarFilePaths,
  styleGrammarFileSchemas,
} from "../contracts/index.js";
import { BrandKitError, loadStyleManifest, readBrandJson, resolveBrandRoot } from "./loader.js";

/**
 * P9.2D manifest-driven Style OS resolution.
 *
 * Chain: brand/current.json → brand version → style/manifest.json →
 * declared style domains → references → reference inbox → resolved
 * snapshot. The loader only reads and reports which style assets exist;
 * it never selects visuals, plans edits, or promotes any status.
 */

const REFERENCE_LIBRARY_DOMAIN = "reference-library" as const;

/** Resolves one versioned Style OS into a deterministic, immutable snapshot. */
export function loadStyleOS(versionInput: string, cwd = process.cwd()): StyleOsSnapshot {
  const manifest = loadStyleManifest(versionInput, cwd);
  const versionDirectory = join(resolveBrandRoot(cwd), `v${manifest?.brand_version ?? versionInput}`);
  const styleVersion = manifest?.style_version ?? versionInput;

  const snapshot = parseStyleOsSnapshot({
    style_version: styleVersion,
    brand_version: manifest?.brand_version ?? versionInput,
    editing_grammar: loadDeclaredGrammarFile(
      manifest?.domains["editing-grammar"]?.path,
      "editing-grammar",
      styleVersion,
      versionDirectory,
    ),
    visual_grammar: loadDeclaredGrammarFile(
      manifest?.domains["visual-grammar"]?.path,
      "visual-grammar",
      styleVersion,
      versionDirectory,
    ),
    motion_library: loadDeclaredGrammarFile(
      manifest?.domains["motion-library"]?.path,
      "motion-library",
      styleVersion,
      versionDirectory,
    ),
    caption_rules: loadDeclaredGrammarFile(
      manifest?.domains["caption-rules"]?.path,
      "caption-rules",
      styleVersion,
      versionDirectory,
    ),
    quality_gates: loadDeclaredGrammarFile(
      manifest?.domains["quality-gates"]?.path,
      "quality-gates",
      styleVersion,
      versionDirectory,
    ),
    references: loadDeclaredReferencesFile(
      manifest?.domains[REFERENCE_LIBRARY_DOMAIN]?.path,
      styleVersion,
      versionDirectory,
    ),
    reference_inbox: loadReferenceInboxFile(styleVersion, versionDirectory),
  });

  return deepFreeze(snapshot);
}

type GrammarDomain = keyof typeof styleGrammarFileSchemas;

/**
 * Loads one manifest-declared grammar domain. Undeclared domains resolve to
 * an explicit empty file (never a preference). A declared path must equal
 * the domain's canonical path, the file must exist, and its style_version
 * must match the manifest. Anything else fails closed.
 */
function loadDeclaredGrammarFile(
  declaredPath: string | undefined,
  domain: GrammarDomain,
  styleVersion: string,
  versionDirectory: string,
): unknown {
  if (declaredPath === undefined) {
    return emptyDomainFile(styleVersion);
  }

  if (declaredPath !== styleGrammarFilePaths[domain]) {
    throw new BrandKitError(
      `Style domain path mismatch: ${domain} must resolve to ${styleGrammarFilePaths[domain]}, found ${declaredPath}`,
    );
  }

  const filePath = join(versionDirectory, declaredPath);
  if (!existsSync(filePath)) {
    throw new BrandKitError(`Declared style domain file does not exist: ${filePath}`);
  }

  const file = readBrandJson(filePath, styleGrammarFileSchemas[domain]);
  assertStyleVersion(filePath, file.style_version, styleVersion);
  return file;
}

function loadDeclaredReferencesFile(
  declaredPath: string | undefined,
  styleVersion: string,
  versionDirectory: string,
): unknown {
  if (declaredPath === undefined) {
    return emptyDomainFile(styleVersion);
  }

  if (declaredPath !== REFERENCES_RELATIVE_PATH) {
    throw new BrandKitError(
      `Style domain path mismatch: reference-library must resolve to ${REFERENCES_RELATIVE_PATH}, found ${declaredPath}`,
    );
  }

  const filePath = join(versionDirectory, declaredPath);
  if (!existsSync(filePath)) {
    throw new BrandKitError(`Declared style domain file does not exist: ${filePath}`);
  }

  const file = readBrandJson(filePath, referencesFileSchema);
  assertStyleVersion(filePath, file.style_version, styleVersion);
  return file;
}

/**
 * The inbox is a fixed capture surface, not a manifest lifecycle domain.
 * Absence is legal and resolves to an empty inbox.
 */
function loadReferenceInboxFile(styleVersion: string, versionDirectory: string): unknown {
  const filePath = join(versionDirectory, REFERENCE_INBOX_RELATIVE_PATH);
  if (!existsSync(filePath)) {
    return emptyDomainFile(styleVersion);
  }

  const file = readBrandJson(filePath, referenceInboxFileSchema);
  assertStyleVersion(filePath, file.style_version, styleVersion);
  return file;
}

function assertStyleVersion(filePath: string, found: string, expected: string): void {
  if (found !== expected) {
    throw new BrandKitError(
      `Style file version mismatch: ${filePath} declares style_version ${found}, expected ${expected}`,
    );
  }
}

/** Recursively freezes plain snapshot data so callers cannot mutate it. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) {
      deepFreeze(entry);
    }
    Object.freeze(value);
  }
  return value;
}
