import {
  parseDirectorPlan,
  type DirectorContext,
  type DirectorPlan,
} from "../contracts/index.js";

/**
 * P9.3A provider-neutral Director seam.
 *
 * Any future Director — strong model, manual tooling, or test double —
 * consumes a DirectorContext and returns a DirectorPlan. The type boundary
 * is the enforcement:
 * - the input carries no write handles, so a provider cannot rewrite the
 *   Frozen Script, mutate Style OS, or touch renderers;
 * - the output type is DirectorPlan only, so Edit Plans, timelines, and
 *   renderer payloads are not legal Director output;
 * - plans are validated against the P9.1 contract before use, so invented
 *   fields never flow downstream.
 *
 * This file defines the seam only. No model provider is implemented here.
 * Manual/imported plans remain the production-safe baseline and already
 * satisfy the output side of this contract (see P9.3B).
 */
export interface DirectorAdapter {
  /** Provider-neutral adapter name. Never a claim of style truth. */
  readonly id: string;
  direct(context: DirectorContext): Promise<DirectorPlan>;
}

/**
 * Validates untrusted Director output against the P9.1 Director Plan
 * contract. Anything that is not a DirectorPlan v1 — including an EditPlan
 * smuggled in as Director output — is rejected here.
 */
export function parseDirectorAdapterOutput(input: unknown): DirectorPlan {
  return parseDirectorPlan(input);
}
