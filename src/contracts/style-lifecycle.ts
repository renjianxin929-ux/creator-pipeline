import { z } from "zod";

import { brandVersionSchema } from "./brand.js";

/**
 * P9.2A Style lifecycle + manifest contract.
 *
 * The lifecycle records how much Founder evidence backs a style item:
 * - UNSET: no Founder preference is known. Agents may make project-local
 *   choices but must never describe them as REN style.
 * - CANDIDATE: a possibly reusable rule exists but is not Founder-approved.
 * - OBSERVED: seen repeatedly in real references or real Founder-approved
 *   outputs, but still not a hard rule.
 * - FROZEN: Founder explicitly approved; downstream layers must treat it as
 *   durable Style OS truth.
 *
 * Hard rule: no code path in P9.2 may automatically promote an item to
 * FROZEN. This file therefore contains no promotion logic of any kind —
 * only schemas, parsing, and read-only status resolution. Promotion,
 * review actions, and learning remain P9.4 scope. Grammar content for the
 * domains below remains P9.2B scope; this file only reserves the slots.
 */

export const styleLifecycleValues = ["UNSET", "CANDIDATE", "OBSERVED", "FROZEN"] as const;
export const styleLifecycleSchema = z.enum(styleLifecycleValues);
export type StyleLifecycleStatus = z.infer<typeof styleLifecycleSchema>;

/** Fixed Style OS domain slots. Grammar content for each slot is out of scope for P9.2A. */
export const styleDomainValues = [
  "editing-grammar",
  "visual-grammar",
  "motion-library",
  "caption-rules",
  "reference-library",
  "quality-gates",
] as const;
export const styleDomainSchema = z.enum(styleDomainValues);
export type StyleDomain = z.infer<typeof styleDomainSchema>;

export const styleDomainSlotSchema = z
  .object({
    status: styleLifecycleSchema,
  })
  .strict();
export type StyleDomainSlot = z.infer<typeof styleDomainSlotSchema>;

export const STYLE_MANIFEST_RELATIVE_PATH = "style/manifest.json";

/**
 * Versioned Style OS manifest. style_version is the Style OS's own identity
 * (independent of any model, vendor, agent, or renderer); brand_version
 * binds the manifest to its host Brand Kit directory. domains is partial:
 * a missing domain is legal and always reads as UNSET, never as an implied
 * Founder preference.
 */
export const styleManifestSchema = z
  .object({
    style_version: brandVersionSchema,
    brand_version: brandVersionSchema,
    domains: z.record(styleDomainSchema, styleDomainSlotSchema).default({}),
  })
  .strict();
export type StyleManifest = z.infer<typeof styleManifestSchema>;

/** Parses unknown JSON into the sole Style OS manifest contract. */
export function parseStyleManifest(input: unknown): StyleManifest {
  return styleManifestSchema.parse(input);
}

/**
 * Read-only status resolution. A domain absent from the manifest resolves to
 * UNSET. This function never invents a preference and never changes one.
 */
export function resolveDomainStatus(
  manifestInput: StyleManifest,
  domainInput: StyleDomain,
): StyleLifecycleStatus {
  const manifest = styleManifestSchema.parse(manifestInput);
  const domain = styleDomainSchema.parse(domainInput);
  return manifest.domains[domain]?.status ?? "UNSET";
}
