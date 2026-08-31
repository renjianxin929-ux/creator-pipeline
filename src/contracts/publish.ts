import { z } from "zod";

import { projectSlugSchema } from "./project.js";
import { sha256Schema } from "./media.js";

export const platformIdValues = [
  "douyin",
  "video_wechat",
  "xiaohongshu",
  "bilibili",
  "youtube",
] as const;

export const platformIdSchema = z.enum(platformIdValues);
export type PlatformId = z.infer<typeof platformIdSchema>;

export const publishResultStatusValues = [
  "accepted",
  "rejected",
  "partial",
  "waiting_user_action",
] as const;

export const publishResultStatusSchema = z.enum(publishResultStatusValues);
export type PublishResultStatus = z.infer<typeof publishResultStatusSchema>;

/**
 * Publish artifacts stay within a project's structured workspace. Secrets and
 * host-specific absolute paths are deliberately not valid contract values.
 */
export const projectRelativePathSchema = z
  .string()
  .min(1)
  .refine(isProjectRelativePath, "path must be a project-relative path without traversal");
export type ProjectRelativePath = z.infer<typeof projectRelativePathSchema>;

export const publishMetadataSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    hashtags: z.array(z.string()),
  })
  .strict();
export type PublishMetadata = z.infer<typeof publishMetadataSchema>;

export const publishPackageSchema = z
  .object({
    project_slug: projectSlugSchema,
    media_path: projectRelativePathSchema,
    media_sha256: sha256Schema,
    metadata: publishMetadataSchema,
  })
  .strict();
export type PublishPackage = z.infer<typeof publishPackageSchema>;

/** A single platform-specific attempt. dry_run must always be explicit. */
export const publishTargetSchema = z
  .object({
    platform: platformIdSchema,
    caption: z.string(),
    cover_path: projectRelativePathSchema,
    media_path: projectRelativePathSchema,
    dry_run: z.boolean(),
  })
  .strict();
export type PublishTarget = z.infer<typeof publishTargetSchema>;

export const publishValidationSchema = z
  .object({
    valid: z.boolean(),
    errors: z.array(z.string().min(1)),
  })
  .strict();
export type PublishValidation = z.infer<typeof publishValidationSchema>;

/**
 * A publish attempt is persisted as a structured result, never inferred from
 * console output or a network response body.
 */
export const publishResultSchema = z
  .object({
    platform: platformIdSchema,
    status: publishResultStatusSchema,
    dry_run: z.boolean(),
    platform_ids: z.array(z.string().min(1)),
    error: z.string().min(1).nullable(),
  })
  .strict();
export type PublishResult = z.infer<typeof publishResultSchema>;

function isProjectRelativePath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");

  return (
    !normalized.startsWith("/") &&
    !/^[a-zA-Z]:\//.test(normalized) &&
    !normalized.split("/").includes("..")
  );
}
