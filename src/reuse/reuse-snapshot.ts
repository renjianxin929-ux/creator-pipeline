import { reuseSnapshotSchema, type ReuseSnapshot } from "../contracts/index.js";
import { resolveProjectBrand } from "../brand/project-brand.js";
import {
  appendProjectEvent,
  readProjectEditPlan,
  readProjectPublishPlan,
  writeProjectReuseSnapshot,
} from "../project/project-store.js";

/**
 * Captures a project's reusable creative choices without copying any media
 * artifact. The snapshot is local structured evidence, not a second source of
 * runtime project state.
 */
export function createProjectReuseSnapshot(slug: string, cwd = process.cwd()): ReuseSnapshot {
  const brand = resolveProjectBrand(slug, cwd).brand;
  const editPlan = readProjectEditPlan(slug, cwd);
  const publishPlan = readProjectPublishPlan(slug, cwd);
  const snapshot = reuseSnapshotSchema.parse({
    version: 1,
    project_slug: slug,
    brand_version: brand.brand_version,
    template_defaults: brand.defaults.templates,
    edit_plan_format: editPlan?.format ?? null,
    publish_plan_platforms: publishPlan?.targets.map((target) => target.platform) ?? [],
  });

  writeProjectReuseSnapshot(slug, snapshot, cwd);
  appendProjectEvent(
    slug,
    {
      ts: new Date().toISOString(),
      stage: "reuse",
      event: "reuse_snapshot_created",
      project: slug,
    },
    cwd,
  );

  return snapshot;
}
