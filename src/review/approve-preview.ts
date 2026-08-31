import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { previewApprovalSchema, type PreviewApproval } from "../contracts/index.js";
import { sha256File } from "../project/file-hash.js";
import {
  appendProjectEvent,
  readProjectPreviewApproval,
  readProjectState,
  removeProjectPreviewApproval,
  resolveProjectDirectory,
  transitionProjectState,
  writeProjectPreviewApproval,
} from "../project/project-store.js";

const previewPathRelativeToProject = "render/preview.mp4";

export class PreviewApprovalError extends Error {
  override name = "PreviewApprovalError";
}

/**
 * Records the Founder's approval against the current preview bytes. Repeating
 * the command for the same bytes does not rewrite the approval record.
 */
export function approveProjectPreview(slug: string, cwd = process.cwd()): PreviewApproval {
  const currentState = readProjectState(slug, cwd);
  if (currentState.status !== "PREVIEW_READY" && currentState.status !== "HUMAN_APPROVED") {
    throw new PreviewApprovalError(
      `Project ${slug} must be PREVIEW_READY before approval; current state is ${currentState.status}`,
    );
  }

  const projectDirectory = resolveProjectDirectory(slug, cwd);
  const previewPath = join(projectDirectory, "render", "preview.mp4");
  if (!existsSync(previewPath) || !statSync(previewPath).isFile()) {
    invalidateMissingPreview(slug, cwd);
  }

  const previewSha256 = sha256File(previewPath);
  const existingApproval = readProjectPreviewApproval(slug, cwd);
  if (
    existingApproval?.preview_path === previewPathRelativeToProject &&
    existingApproval.preview_sha256 === previewSha256
  ) {
    return existingApproval;
  }

  const editPlanPath = join(projectDirectory, "plans", "edit-plan.json");
  const approval = previewApprovalSchema.parse({
    preview_path: previewPathRelativeToProject,
    preview_sha256: previewSha256,
    approved_at: new Date().toISOString(),
    approved_by: "founder",
    ...(existsSync(editPlanPath) ? { edit_plan_sha256: sha256File(editPlanPath) } : {}),
  });

  writeProjectPreviewApproval(slug, approval, cwd);
  if (currentState.status === "PREVIEW_READY") {
    transitionProjectState(slug, "HUMAN_APPROVED", cwd);
  }
  appendProjectEvent(
    slug,
    {
      ts: new Date().toISOString(),
      stage: "approval",
      event: "preview_approved",
      project: slug,
    },
    cwd,
  );

  return approval;
}

function invalidateMissingPreview(slug: string, cwd: string): never {
  removeProjectPreviewApproval(slug, cwd);
  transitionProjectState(slug, "WAITING_USER_ACTION", cwd);
  appendProjectEvent(
    slug,
    {
      ts: new Date().toISOString(),
      stage: "approval",
      event: "waiting_for_preview",
      project: slug,
    },
    cwd,
  );
  throw new PreviewApprovalError(
    `Project ${slug} cannot be approved because render/preview.mp4 is missing; regenerate the preview first.`,
  );
}
