import { z } from "zod";

import { brandVersionSchema } from "./brand.js";

/**
 * P9.2A Style lifecycle + manifest contract.
 *
 * Two strictly separated concerns:
 * - Lifecycle (UNSET | CANDIDATE | OBSERVED | FROZEN) belongs to individual
 *   style items/rules, which are P9.2B scope. One domain will hold items in
 *   mixed states, so a domain as a whole can never be "FROZEN" or "UNSET".
 * - The manifest below only records domain presence: which style domains
 *   exist and where their files live. Presence is not a preference and
 *   carries no lifecycle judgment.
 *
 * Lifecycle semantics (for P9.2B items):
 * - UNSET: no Founder preference is known. Agents may make project-local
 *   choices but must never describe them as REN style.
 * - CANDIDATE: a possibly reusable rule exists but is not Founder-approved.
 * - OBSERVED: seen repeatedly in real references or real Founder-approved
 *   outputs, but still not a hard rule.
 * - FROZEN: Founder explicitly approved; downstream layers must treat it as
 *   durable Style OS truth.
 *
 * Hard rule: no code path in P9.2 may automatically promote an item to
 * FROZEN. This file therefore contains no promotion logic and no
 * aggregate-status computation of any kind. Promotion, review actions, and
 * learning remain P9.4 scope. Grammar content for the domains below remains
 * P9.2B scope; this file only reserves the slots.
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

/**
 * A domain slot only locates/declares a Style OS domain file. It carries no
 * lifecycle status and no preference: a declared domain only means its file
 * is expected at the given Brand Kit-relative path (always under style/).
 */
const vendorPattern = /(asta|gpt|claude|codex|hyperframes|remotion|ffmpeg|opencut|smartsub|video-?use|openmontage)/i;
export const styleDomainSlotSchema = z
  .object({
    path: z
      .string()
      .regex(/^style\/[a-z0-9][a-z0-9-]*\.json$/, "domain path must be a style-relative JSON file such as style/editing-grammar.json")
      .refine((value) => !vendorPattern.test(value), {
        message: "domain path must not name a vendor, agent, or renderer",
      }),
  })
  .strict();
export type StyleDomainSlot = z.infer<typeof styleDomainSlotSchema>;

export const STYLE_MANIFEST_RELATIVE_PATH = "style/manifest.json";

/**
 * Versioned Style OS manifest. style_version is the Style OS's own identity
 * (independent of any model, vendor, agent, or renderer); brand_version
 * binds the manifest to its host Brand Kit directory. domains is partial:
 * a missing domain is legal and only means that domain is not established
 * or provided yet — never an implied Founder preference.
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
