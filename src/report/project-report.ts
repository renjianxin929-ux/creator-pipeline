import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  platformIdValues,
  projectReportSchema,
  publishResultSchema,
  reportAbsentValue,
  type ProjectReport,
  type PublishResult,
} from "../contracts/index.js";
import { sha256File } from "../project/file-hash.js";
import {
  appendProjectEvent,
  readProjectEvents,
  readProjectMediaRecords,
  readProjectPreviewApproval,
  readProjectState,
  resolveProjectDirectory,
  writeProjectReport,
} from "../project/project-store.js";

const masterPathRelativeToProject = "publish/package/master.mp4";

/**
 * Builds a report from the project's structured evidence. Missing stage files
 * are represented as `absent`, so reporting never requires an E2E run.
 */
export function createProjectReport(slug: string, cwd = process.cwd()): ProjectReport {
  const state = readProjectState(slug, cwd);
  const report = projectReportSchema.parse({
    version: 1,
    project_slug: slug,
    state: state.status,
    media_count: readProjectMediaRecords(slug, cwd).length,
    transcript_adapter: findTranscriptAdapter(slug, cwd) ?? reportAbsentValue,
    preview_hash: readProjectPreviewApproval(slug, cwd)?.preview_sha256 ?? reportAbsentValue,
    export_master_hash: readExportMasterHash(slug, cwd) ?? reportAbsentValue,
    dry_run_results: readDryRunResults(slug, cwd) ?? reportAbsentValue,
  });

  writeProjectReport(slug, report, cwd);
  appendProjectEvent(
    slug,
    {
      ts: new Date().toISOString(),
      stage: "report",
      event: "project_report_created",
      project: slug,
    },
    cwd,
  );

  return report;
}

function findTranscriptAdapter(slug: string, cwd: string): string | undefined {
  const successfulTranscriptions = readProjectEvents(slug, cwd).filter(
    (event) => event.stage === "transcribe" && event.event === "transcribe_succeeded" && event.provider !== undefined,
  );

  return successfulTranscriptions.at(-1)?.provider;
}

function readExportMasterHash(slug: string, cwd: string): string | undefined {
  const masterPath = join(resolveProjectDirectory(slug, cwd), masterPathRelativeToProject);
  return existsSync(masterPath) && statSync(masterPath).isFile() ? sha256File(masterPath) : undefined;
}

function readDryRunResults(slug: string, cwd: string): PublishResult[] | undefined {
  const resultsDirectory = join(resolveProjectDirectory(slug, cwd), "publish", "results");
  const results: PublishResult[] = [];

  for (const platform of platformIdValues) {
    const resultPath = join(resultsDirectory, `${platform}.json`);
    if (!existsSync(resultPath) || !statSync(resultPath).isFile()) {
      continue;
    }

    let rawResult: unknown;
    try {
      rawResult = JSON.parse(readFileSync(resultPath, "utf8"));
    } catch {
      throw new Error(`Unable to read valid dry-run result for ${platform}`);
    }

    const parsed = publishResultSchema.safeParse(rawResult);
    if (!parsed.success || parsed.data.platform !== platform || !parsed.data.dry_run) {
      throw new Error(`Invalid dry-run result for ${platform}`);
    }
    results.push(parsed.data);
  }

  return results.length > 0 ? results : undefined;
}
