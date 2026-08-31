import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sha256File } from "../project/file-hash.js";
import {
  appendProjectEvent,
  readProjectPreviewApproval,
  readProjectState,
  removeProjectPreviewApproval,
  resolveProjectDirectory,
  transitionProjectState,
} from "../project/project-store.js";

const previewPathRelativeToProject = "render/preview.mp4";
const masterPathRelativeToProject = "publish/package/master.mp4";

export class ExportPackageError extends Error {
  override name = "ExportPackageError";
}

export interface ExportApprovedPackageResult {
  master_path: string;
  metadata_path: string;
  preview_sha256: string;
}

/**
 * Copies the byte-approved preview into the local review package. It never
 * re-encodes video or invokes a publisher.
 */
export function exportApprovedPackage(slug: string, cwd = process.cwd()): ExportApprovedPackageResult {
  const currentState = readProjectState(slug, cwd);
  if (currentState.status !== "HUMAN_APPROVED" && currentState.status !== "EXPORT_READY") {
    throw new ExportPackageError(
      `Project ${slug} must be HUMAN_APPROVED before export; current state is ${currentState.status}`,
    );
  }

  const projectDirectory = resolveProjectDirectory(slug, cwd);
  const previewPath = join(projectDirectory, "render", "preview.mp4");
  if (!existsSync(previewPath) || !statSync(previewPath).isFile()) {
    invalidateApprovalForExport(slug, "WAITING_USER_ACTION", cwd);
  }

  const approval = readProjectPreviewApproval(slug, cwd);
  if (approval === undefined) {
    invalidateApprovalForExport(slug, "PREVIEW_READY", cwd);
  }

  const previewSha256 = sha256File(previewPath);
  if (
    approval.preview_path !== previewPathRelativeToProject ||
    approval.preview_sha256 !== previewSha256
  ) {
    invalidateApprovalForExport(slug, "PREVIEW_READY", cwd);
  }

  const packageDirectory = join(projectDirectory, "publish", "package");
  const masterPath = join(packageDirectory, "master.mp4");
  const metadataPath = join(packageDirectory, "metadata.json");
  if (
    currentState.status === "EXPORT_READY" &&
    existsSync(masterPath) &&
    statSync(masterPath).isFile() &&
    sha256File(masterPath) === approval.preview_sha256 &&
    existsSync(metadataPath)
  ) {
    return { master_path: masterPath, metadata_path: metadataPath, preview_sha256: previewSha256 };
  }

  mkdirSync(packageDirectory, { recursive: true });
  copyFileSync(previewPath, masterPath);
  const masterSha256 = sha256File(masterPath);
  if (masterSha256 !== approval.preview_sha256) {
    throw new ExportPackageError("Exported master.mp4 does not match the approved preview bytes");
  }

  writeFileSync(
    metadataPath,
    `${JSON.stringify(
      {
        title: "",
        description: "",
        hashtags: [],
        source: {
          preview_path: approval.preview_path,
          preview_sha256: approval.preview_sha256,
          ...(approval.edit_plan_sha256 === undefined ? {} : { edit_plan_sha256: approval.edit_plan_sha256 }),
        },
        master: {
          path: masterPathRelativeToProject,
          sha256: masterSha256,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    join(packageDirectory, "cover.TODO"),
    "No cover image was generated in P6. Create a reviewed cover before publish preparation.\n",
    "utf8",
  );

  if (currentState.status === "HUMAN_APPROVED") {
    transitionProjectState(slug, "EXPORT_READY", cwd);
  }
  appendProjectEvent(
    slug,
    {
      ts: new Date().toISOString(),
      stage: "export",
      event: "approved_package_created",
      project: slug,
    },
    cwd,
  );

  return { master_path: masterPath, metadata_path: metadataPath, preview_sha256: previewSha256 };
}

function invalidateApprovalForExport(
  slug: string,
  nextStatus: "PREVIEW_READY" | "WAITING_USER_ACTION",
  cwd: string,
): never {
  removeProjectPreviewApproval(slug, cwd);
  transitionProjectState(slug, nextStatus, cwd);
  appendProjectEvent(
    slug,
    {
      ts: new Date().toISOString(),
      stage: "export",
      event: nextStatus === "PREVIEW_READY" ? "approval_invalidated" : "waiting_for_preview",
      project: slug,
    },
    cwd,
  );
  throw new ExportPackageError(
    nextStatus === "PREVIEW_READY"
      ? `Project ${slug} approval is missing or stale; run creator approve ${slug} again.`
      : `Project ${slug} cannot be exported because render/preview.mp4 is missing.`,
  );
}
