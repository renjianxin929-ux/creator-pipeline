import { z } from "zod";

import { projectSlugSchema } from "./project.js";
import { semanticRoleSchema } from "./director.js";

/**
 * P9.4C style-candidate discovery contracts.
 *
 * This artifact is derived observation of repeated Founder CHANGE patterns.
 * It is not Style OS, not a lifecycle promotion, and not a Golden Set.
 *
 * Status values are discovery/approval states only. They are intentionally
 * disjoint from Style lifecycle UNSET / CANDIDATE / OBSERVED / FROZEN.
 * APPROVED_FOR_STYLE_PROPOSAL only permits exporting a proposal; it never
 * writes brand/ style files.
 */

export const STYLE_CANDIDATES_RELATIVE_PATH = "review/style-candidates.json";
export const STYLE_CANDIDATE_APPROVALS_RELATIVE_PATH = "review/style-candidate-approvals.json";

const vendorPattern =
  /(asta|gpt|claude|codex|hyperframes|remotion|ffmpeg|opencut|smartsub|video-?use|openmontage)/i;

const durableIdSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !vendorPattern.test(value), {
    message: "id must not name a vendor, agent, or renderer",
  });

export const styleCandidateDiscoveryStatusValues = ["DISCOVERED"] as const;
export const styleCandidateDiscoveryStatusSchema = z.enum(styleCandidateDiscoveryStatusValues);
export type StyleCandidateDiscoveryStatus = z.infer<typeof styleCandidateDiscoveryStatusSchema>;

export const styleCandidateApprovalActionValues = ["APPROVE_STYLE_PROPOSAL", "DISMISS"] as const;
export const styleCandidateApprovalActionSchema = z.enum(styleCandidateApprovalActionValues);
export type StyleCandidateApprovalAction = z.infer<typeof styleCandidateApprovalActionSchema>;

export const styleCandidateFieldNameValues = [
  "semantic_role",
  "primary_visual",
  "allowed_visuals",
  "forbidden_visuals",
  "caption_mode",
  "emphasis_text",
  "motion_id",
  "director_intent",
] as const;
export const styleCandidateFieldNameSchema = z.enum(styleCandidateFieldNameValues);
export type StyleCandidateFieldName = z.infer<typeof styleCandidateFieldNameSchema>;

const scalarOrListSchema = z.union([z.string(), z.array(z.string())]);

export const styleCandidateFieldChangeSchema = z
  .object({
    field: styleCandidateFieldNameSchema,
    from: scalarOrListSchema.nullable(),
    to: scalarOrListSchema.nullable(),
  })
  .strict();
export type StyleCandidateFieldChange = z.infer<typeof styleCandidateFieldChangeSchema>;

export const styleCandidateSchema = z
  .object({
    candidate_id: durableIdSchema,
    signature: z.string().trim().min(1),
    evidence_decision_ids: z.array(z.string().trim().min(1)).min(2),
    evidence_review_ids: z.array(z.string().trim().min(1)).min(1),
    occurrence_count: z.number().int().min(2),
    affected_semantic_roles: z.array(semanticRoleSchema).min(1),
    field_changes: z.array(styleCandidateFieldChangeSchema).min(1),
    status: styleCandidateDiscoveryStatusSchema,
  })
  .strict()
  .superRefine((candidate, context) => {
    if (candidate.occurrence_count !== candidate.evidence_decision_ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["occurrence_count"],
        message: "occurrence_count must equal unique evidence_decision_ids length",
      });
    }
  });
export type StyleCandidate = z.infer<typeof styleCandidateSchema>;

export const styleCandidateDiscoverySchema = z
  .object({
    version: z.literal(1),
    project_slug: projectSlugSchema,
    project_id: z.string().min(1),
    candidates: z.array(styleCandidateSchema).default([]),
  })
  .strict()
  .superRefine((discovery, context) => {
    const seen = new Set<string>();
    for (const [index, candidate] of discovery.candidates.entries()) {
      if (seen.has(candidate.candidate_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["candidates", index, "candidate_id"],
          message: "candidate_id must be unique",
        });
      }
      seen.add(candidate.candidate_id);
    }
  });
export type StyleCandidateDiscovery = z.infer<typeof styleCandidateDiscoverySchema>;

export function parseStyleCandidateDiscovery(input: unknown): StyleCandidateDiscovery {
  return styleCandidateDiscoverySchema.parse(input);
}

export const styleCandidateApprovalRecordSchema = z
  .object({
    approval_id: durableIdSchema,
    candidate_id: durableIdSchema,
    action: styleCandidateApprovalActionSchema,
    reason: z.string().trim().min(1).optional(),
  })
  .strict();
export type StyleCandidateApprovalRecord = z.infer<typeof styleCandidateApprovalRecordSchema>;

export const styleCandidateApprovalDatasetSchema = z
  .object({
    version: z.literal(1),
    project_slug: projectSlugSchema,
    project_id: z.string().min(1),
    approvals: z.array(styleCandidateApprovalRecordSchema).default([]),
  })
  .strict()
  .superRefine((dataset, context) => {
    const seen = new Set<string>();
    for (const [index, approval] of dataset.approvals.entries()) {
      if (seen.has(approval.approval_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["approvals", index, "approval_id"],
          message: "approval_id must be unique",
        });
      }
      seen.add(approval.approval_id);
    }
  });
export type StyleCandidateApprovalDataset = z.infer<typeof styleCandidateApprovalDatasetSchema>;

export function parseStyleCandidateApprovalDataset(input: unknown): StyleCandidateApprovalDataset {
  return styleCandidateApprovalDatasetSchema.parse(input);
}

/**
 * A proposed Style patch. Exporting this object is not a Style OS write and
 * does not assign FROZEN / OBSERVED / CANDIDATE lifecycle.
 */
export const stylePatchProposalSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("style-patch-proposal"),
    candidate_id: durableIdSchema,
    signature: z.string().trim().min(1),
    field_changes: z.array(styleCandidateFieldChangeSchema).min(1),
    affected_semantic_roles: z.array(semanticRoleSchema).min(1),
    applies_to_style_os: z.literal(false),
  })
  .strict();
export type StylePatchProposal = z.infer<typeof stylePatchProposalSchema>;
