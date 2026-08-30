import {
  resolveBrand,
  resolveBrandTemplates,
  type ProjectIdentity,
  type ResolvedBrand,
} from "../contracts/index.js";
import { readProjectIdentity } from "../project/project-store.js";
import { loadBrandKit, loadCurrentBrandKit } from "./loader.js";

export interface ProjectBrandResolution {
  project: ProjectIdentity;
  brand: ResolvedBrand;
}

/** Resolves a project's selected kit, bounded override, and template choices. */
export function resolveProjectBrand(slug: string, cwd = process.cwd()): ProjectBrandResolution {
  const project = readProjectIdentity(slug, cwd);
  const kit =
    project.brand_version === undefined
      ? loadCurrentBrandKit(cwd)
      : loadBrandKit(project.brand_version, cwd);
  const withOverride = resolveBrand(kit, project.brand_override);

  return {
    project,
    brand: resolveBrandTemplates(withOverride, project.brand_templates),
  };
}
