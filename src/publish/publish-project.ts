import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  platformIdValues,
  publishMetadataSchema,
  publishPackageSchema,
  publishPlanSchema,
  publishTargetSchema,
  type PlatformId,
  type PublishMetadata,
  type PublishPackage,
  type PublishPlan,
  type PublishResult,
} from "../contracts/publish.js";
import { sha256File } from "../project/file-hash.js";
import {
  appendProjectEvent,
  readProjectPublishPlan,
  readProjectState,
  resolveProjectDirectory,
  transitionProjectState,
  writeProjectPublishPlan,
} from "../project/project-store.js";
import { DryRunPublisherAdapter } from "./dry-run-adapter.js";

const masterPathRelativeToProject = "publish/package/master.mp4";
const metadataPathRelativeToProject = "publish/package/metadata.json";
const coverPathRelativeToProject = "publish/package/cover.TODO";

export class PublishProjectError extends Error {
  override name = "PublishProjectError";
}

export interface DryRunProjectPublishResult {
  plan: PublishPlan;
  results: PublishResult[];
}

/**
 * Creates a structured publish plan only. The resulting targets are all
 * explicit dry-runs; no adapter or external system is invoked here.
 */
export function planProjectPublish(slug: string, cwd = process.cwd()): PublishPlan {
  const state = readProjectState(slug, cwd);
  if (state.status !== "EXPORT_READY") {
    throw new PublishProjectError(
      `Project ${slug} must be EXPORT_READY before publish planning; current state is ${state.status}`,
    );
  }

  const publishPackage = readCurrentPublishPackage(slug, cwd);
  const caption = buildCaption(publishPackage.metadata);
  const plan = publishPlanSchema.parse({
    version: 1,
    project_slug: slug,
    package: publishPackage,
    targets: platformIdValues.map((platform) =>
      publishTargetSchema.parse({
        platform,
        caption,
        cover_path: coverPathRelativeToProject,
        media_path: publishPackage.media_path,
        dry_run: true,
      }),
    ),
  });

  writeProjectPublishPlan(slug, plan, cwd);
  appendProjectEvent(
    slug,
    {
      ts: new Date().toISOString(),
      stage: "publish",
      event: "publish_plan_created",
      project: slug,
    },
    cwd,
  );

  return plan;
}

/**
 * Executes only local result-writing adapters. The opt-in environment flag is
 * checked through each adapter; no network, browser, credential, or live
 * publisher is available in P7.
 */
export async function dryRunProjectPublish(
  slug: string,
  cwd = process.cwd(),
): Promise<DryRunProjectPublishResult> {
  const state = readProjectState(slug, cwd);
  if (state.status !== "EXPORT_READY" && state.status !== "PUBLISH_READY") {
    throw new PublishProjectError(
      `Project ${slug} must be EXPORT_READY before publish dry-run; current state is ${state.status}`,
    );
  }

  const plan = readProjectPublishPlan(slug, cwd);
  if (plan === undefined) {
    throw new PublishProjectError(`Project ${slug} has no publish plan; run creator publish plan ${slug} first.`);
  }

  const currentPackage = readCurrentPublishPackage(slug, cwd);
  if (
    plan.package.media_path !== currentPackage.media_path ||
    plan.package.media_sha256 !== currentPackage.media_sha256
  ) {
    waitForPublishArtifact(slug, "publish plan no longer matches master.mp4", cwd);
  }

  const projectDirectory = resolveProjectDirectory(slug, cwd);
  const resultsDirectory = join(projectDirectory, "publish", "results");
  const adapters = plan.targets.map(
    (target) => new DryRunPublisherAdapter(target.platform, { results_directory: resultsDirectory }),
  );
  const unavailablePlatforms = (
    await Promise.all(adapters.map(async (adapter) => ((await adapter.available()) ? undefined : adapter.id)))
  ).filter((platform): platform is PlatformId => platform !== undefined);

  if (unavailablePlatforms.length > 0) {
    throw new PublishProjectError(
      "Publish dry-run is disabled; set CREATOR_PUBLISH_DRY_RUN=1. No publisher was invoked.",
    );
  }

  const results: PublishResult[] = [];
  for (const [index, target] of plan.targets.entries()) {
    const adapter = adapters[index]!;
    const result = await adapter.publish(plan.package, target);
    results.push(result);
  }

  const allAccepted = results.every((result) => result.status === "accepted");
  if (allAccepted && state.status === "EXPORT_READY") {
    transitionProjectState(slug, "PUBLISH_READY", cwd);
  }

  appendProjectEvent(
    slug,
    {
      ts: new Date().toISOString(),
      stage: "publish",
      event: allAccepted ? "publish_dry_run_completed" : "publish_dry_run_needs_attention",
      project: slug,
    },
    cwd,
  );

  return { plan, results };
}

function readCurrentPublishPackage(slug: string, cwd: string): PublishPackage {
  const projectDirectory = resolveProjectDirectory(slug, cwd);
  const masterPath = join(projectDirectory, "publish", "package", "master.mp4");
  if (!existsSync(masterPath) || !statSync(masterPath).isFile()) {
    waitForPublishArtifact(slug, "publish/package/master.mp4 is missing", cwd);
  }

  return publishPackageSchema.parse({
    project_slug: slug,
    media_path: masterPathRelativeToProject,
    media_sha256: sha256File(masterPath),
    metadata: readPublishMetadata(projectDirectory),
  });
}

function readPublishMetadata(projectDirectory: string): PublishMetadata {
  const metadataPath = join(projectDirectory, metadataPathRelativeToProject);
  if (!existsSync(metadataPath) || !statSync(metadataPath).isFile()) {
    return emptyPublishMetadata();
  }

  try {
    const parsed = JSON.parse(readFileSync(metadataPath, "utf8")) as Record<string, unknown>;
    return publishMetadataSchema.parse({
      title: typeof parsed.title === "string" ? parsed.title : "",
      description: typeof parsed.description === "string" ? parsed.description : "",
      hashtags: Array.isArray(parsed.hashtags)
        ? parsed.hashtags.filter((hashtag): hashtag is string => typeof hashtag === "string")
        : [],
    });
  } catch {
    return emptyPublishMetadata();
  }
}

function emptyPublishMetadata(): PublishMetadata {
  return { title: "", description: "", hashtags: [] };
}

function buildCaption(metadata: PublishMetadata): string {
  const hashtags = metadata.hashtags.map((hashtag) => (hashtag.startsWith("#") ? hashtag : `#${hashtag}`));
  return [metadata.title, metadata.description, hashtags.join(" ")].filter((part) => part.length > 0).join("\n");
}

function waitForPublishArtifact(slug: string, reason: string, cwd: string): never {
  const state = readProjectState(slug, cwd);
  if (state.status === "EXPORT_READY" || state.status === "PUBLISH_READY") {
    transitionProjectState(slug, "WAITING_USER_ACTION", cwd);
  }
  appendProjectEvent(
    slug,
    {
      ts: new Date().toISOString(),
      stage: "publish",
      event: "waiting_for_publish_artifact",
      project: slug,
    },
    cwd,
  );
  throw new PublishProjectError(`Project ${slug} cannot publish: ${reason}.`);
}
