import {
  applyFounderReplacement,
  parseFounderDecisionDataset,
  parseStyleCandidateApprovalDataset,
  parseStyleCandidateDiscovery,
  stylePatchProposalSchema,
  type DirectorSegment,
  type FounderDecisionDataset,
  type StyleCandidate,
  type StyleCandidateApprovalDataset,
  type StyleCandidateApprovalRecord,
  type StyleCandidateDiscovery,
  type StyleCandidateFieldChange,
  type StyleCandidateFieldName,
  type StylePatchProposal,
} from "../contracts/index.js";
import { sha256Bytes } from "../project/file-hash.js";
import {
  readProjectDirectorDecisions,
  readProjectIdentity,
  writeProjectStyleCandidateApprovals,
  writeProjectStyleCandidates,
} from "../project/project-store.js";

export class StyleCandidateDiscoveryError extends Error {
  override name = "StyleCandidateDiscoveryError";
}

const TRACKED_FIELDS: readonly StyleCandidateFieldName[] = [
  "semantic_role",
  "primary_visual",
  "allowed_visuals",
  "forbidden_visuals",
  "caption_mode",
  "emphasis_text",
  "motion_id",
  "director_intent",
];

/**
 * Deterministic discovery from a Founder Decision Dataset. Only CHANGE
 * decisions with reuse_scope REUSABLE_CANDIDATE are evidence. One match is
 * not a repeated candidate; two or more unique decision_ids with the same
 * normalized signature are. Occurrence count never changes Style lifecycle.
 */
export function discoverStyleCandidates(datasetInput: FounderDecisionDataset): StyleCandidateDiscovery {
  const dataset = parseFounderDecisionDataset(datasetInput);
  const groups = new Map<string, GroupAccumulator>();

  for (const review of dataset.reviews) {
    for (const decision of review.decisions) {
      if (decision.action !== "CHANGE" || decision.reuse_scope !== "REUSABLE_CANDIDATE") {
        continue;
      }
      const resolved = applyFounderReplacement(decision.proposal, decision.replacement);
      const fieldChanges = diffTrackedFields(decision.proposal, resolved);
      if (fieldChanges.length === 0) {
        continue;
      }
      const signature = buildSignature(decision.proposal.semantic_role, fieldChanges);
      const existing = groups.get(signature);
      if (existing === undefined) {
        groups.set(signature, {
          signature,
          fieldChanges,
          decisionIds: new Set([decision.decision_id]),
          reviewIds: new Set([review.review_id]),
          roles: new Set([decision.proposal.semantic_role]),
        });
        continue;
      }
      existing.decisionIds.add(decision.decision_id);
      existing.reviewIds.add(review.review_id);
      existing.roles.add(decision.proposal.semantic_role);
    }
  }

  const candidates = [...groups.values()]
    .filter((group) => group.decisionIds.size >= 2)
    .map((group) => toCandidate(group))
    .sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));

  return parseStyleCandidateDiscovery({
    version: 1,
    project_slug: dataset.project_slug,
    project_id: dataset.project_id,
    candidates,
  });
}

export function discoverProjectStyleCandidates(slug: string, cwd = process.cwd()): StyleCandidateDiscovery {
  const identity = readProjectIdentity(slug, cwd);
  const dataset = readProjectDirectorDecisions(slug, cwd);
  const discovery =
    dataset === undefined
      ? parseStyleCandidateDiscovery({
          version: 1,
          project_slug: identity.slug,
          project_id: identity.id,
          candidates: [],
        })
      : discoverStyleCandidates(dataset);
  writeProjectStyleCandidates(slug, discovery, cwd);
  return discovery;
}

export function recordStyleCandidateApproval(
  slug: string,
  approval: StyleCandidateApprovalRecord,
  existing: StyleCandidateApprovalDataset | undefined,
  discovery: StyleCandidateDiscovery,
  cwd = process.cwd(),
): StyleCandidateApprovalDataset {
  if (!discovery.candidates.some((candidate) => candidate.candidate_id === approval.candidate_id)) {
    throw new StyleCandidateDiscoveryError(
      `Cannot approve unknown style candidate ${approval.candidate_id}`,
    );
  }
  const next = parseStyleCandidateApprovalDataset({
    version: 1,
    project_slug: discovery.project_slug,
    project_id: discovery.project_id,
    approvals: [...(existing?.approvals ?? []), approval],
  });
  writeProjectStyleCandidateApprovals(slug, next, cwd);
  return next;
}

/**
 * Exports a Style patch proposal after an explicit Founder approval. The
 * proposal never applies itself to Style OS.
 */
export function exportStylePatchProposal(
  candidate: StyleCandidate,
  approval: StyleCandidateApprovalRecord,
): StylePatchProposal {
  if (approval.candidate_id !== candidate.candidate_id) {
    throw new StyleCandidateDiscoveryError("Style proposal approval does not match the candidate");
  }
  if (approval.action !== "APPROVE_STYLE_PROPOSAL") {
    throw new StyleCandidateDiscoveryError("Style proposal export requires APPROVE_STYLE_PROPOSAL");
  }
  return stylePatchProposalSchema.parse({
    version: 1,
    kind: "style-patch-proposal",
    candidate_id: candidate.candidate_id,
    signature: candidate.signature,
    field_changes: candidate.field_changes,
    affected_semantic_roles: candidate.affected_semantic_roles,
    applies_to_style_os: false,
  });
}

interface GroupAccumulator {
  signature: string;
  fieldChanges: StyleCandidateFieldChange[];
  decisionIds: Set<string>;
  reviewIds: Set<string>;
  roles: Set<DirectorSegment["semantic_role"]>;
}

function toCandidate(group: GroupAccumulator): StyleCandidate {
  const evidenceDecisionIds = [...group.decisionIds].sort();
  return {
    candidate_id: `candidate_${sha256Bytes(Buffer.from(group.signature, "utf8"))}`,
    signature: group.signature,
    evidence_decision_ids: evidenceDecisionIds,
    evidence_review_ids: [...group.reviewIds].sort(),
    occurrence_count: evidenceDecisionIds.length,
    affected_semantic_roles: [...group.roles].sort(),
    field_changes: group.fieldChanges,
    status: "DISCOVERED",
  };
}

function diffTrackedFields(proposal: DirectorSegment, resolved: DirectorSegment): StyleCandidateFieldChange[] {
  const changes: StyleCandidateFieldChange[] = [];
  for (const field of TRACKED_FIELDS) {
    const from = canonicalize(readField(proposal, field));
    const to = canonicalize(readField(resolved, field));
    if (sameCanonical(from, to)) {
      continue;
    }
    changes.push({ field, from, to });
  }
  return changes;
}

function buildSignature(role: DirectorSegment["semantic_role"], changes: readonly StyleCandidateFieldChange[]): string {
  return `${role}|${changes.map((change) => `${change.field}:${JSON.stringify(change.from)}>${JSON.stringify(change.to)}`).join(";")}`;
}

function readField(segment: DirectorSegment, field: StyleCandidateFieldName): unknown {
  return segment[field];
}

function canonicalize(value: unknown): string | string[] | null {
  if (value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return [...value].map((item) => String(item)).sort();
  }
  return String(value);
}

function sameCanonical(left: string | string[] | null, right: string | string[] | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
