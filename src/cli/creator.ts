#!/usr/bin/env node

import { runDoctor } from "./doctor.js";
import { planProjectAssets } from "../assets/asset-planner.js";
import { generateProjectAssets } from "../assets/generate-assets.js";
import { resolveProjectBrand } from "../brand/project-brand.js";
import { planProjectEdit } from "../edit/edit-planner.js";
import { ingestMedia } from "../ingest/ingest-media.js";
import { initializeProject, ProjectStoreError, readProjectState } from "../project/project-store.js";
import { renderProjectPreview } from "../render/preview-renderer.js";
import { selectDefaultTranscribeAdapter } from "../transcribe/adapter-selection.js";
import { transcribeProject } from "../transcribe/transcribe-project.js";

const helpText = `Creator Pipeline P5 CLI

Usage:
  creator doctor
  creator init <slug>
  creator brand <slug>
  creator ingest <slug> <path...>
  creator transcribe <slug>
  creator assets plan <slug>
  creator assets generate <slug>
  creator edit plan <slug>
  creator render preview <slug>
  creator status <slug>`;

async function main(arguments_: readonly string[]): Promise<number> {
  const [command, ...argumentsForCommand] = arguments_;

  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    write(helpText);
    return 0;
  }

  try {
    switch (command) {
      case "doctor":
        requireArgumentCount(command, argumentsForCommand, 0);
        return doctor();
      case "init":
        requireArgumentCount(command, argumentsForCommand, 1);
        return init(argumentsForCommand[0]!);
      case "brand":
        requireArgumentCount(command, argumentsForCommand, 1);
        return brand(argumentsForCommand[0]!);
      case "ingest":
        requireMinimumArgumentCount(command, argumentsForCommand, 2);
        return ingest(argumentsForCommand[0]!, argumentsForCommand.slice(1));
      case "transcribe":
        requireArgumentCount(command, argumentsForCommand, 1);
        return transcribe(argumentsForCommand[0]!);
      case "assets":
        return assets(argumentsForCommand);
      case "edit":
        return edit(argumentsForCommand);
      case "render":
        return render(argumentsForCommand);
      case "status":
        requireArgumentCount(command, argumentsForCommand, 1);
        return status(argumentsForCommand[0]!);
      default:
        throw new CliError(`Unknown command: ${command}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected CLI error";
    writeError(`ERROR ${message}`);
    return 1;
  }
}

function doctor(): number {
  const report = runDoctor();
  for (const check of report.checks) {
    write(`${check.level} ${check.name} ${check.detail}`);
  }

  return report.ok ? 0 : 1;
}

function init(slug: string): number {
  const project = initializeProject(slug);
  write(`CREATED ${project.identity.slug} ${project.directory}`);
  return 0;
}

function brand(slug: string): number {
  const resolution = resolveProjectBrand(slug);
  write(
    JSON.stringify(
      {
        brand_version: resolution.brand.brand_version,
        templates: resolution.brand.templates.ids,
        template_defaults: resolution.brand.defaults.templates,
        brand_override: resolution.project.brand_override ?? {},
      },
      null,
      2,
    ),
  );
  return 0;
}

function status(slug: string): number {
  const state = readProjectState(slug);
  write(`${slug}: ${state.status}`);
  return 0;
}

async function ingest(slug: string, inputPaths: readonly string[]): Promise<number> {
  const result = await ingestMedia(slug, inputPaths);

  for (const media of result.ingested) {
    write(`INGESTED ${slug} ${media.id}`);
  }

  for (const media of result.duplicate_skipped) {
    write(`SKIPPED ${slug} ${media.id}`);
  }

  for (const failure of result.failures) {
    writeError(`ERROR ${failure.input_path}: ${failure.message}`);
  }

  return result.failures.length === 0 ? 0 : 1;
}

async function transcribe(slug: string): Promise<number> {
  const selection = selectDefaultTranscribeAdapter();
  const result = await transcribeProject(slug, selection.adapter, selection.unavailable_reason);
  write(`TRANSCRIBED ${slug} ${result.media.id} ${result.adapter_id}`);
  return 0;
}

async function assets(argumentsForCommand: readonly string[]): Promise<number> {
  const [subcommand, slug, ...remaining] = argumentsForCommand;
  if (slug === undefined || remaining.length !== 0) {
    throw new CliError("Usage: creator assets <plan|generate> <slug>");
  }

  switch (subcommand) {
    case "plan": {
      const plan = planProjectAssets(slug);
      write(`ASSET_PLAN_READY ${slug} ${plan.requests.length}`);
      return 0;
    }
    case "generate": {
      const result = await generateProjectAssets(slug);
      write(`${result.status} ${slug} ${result.manifest.assets.length}`);
      return 0;
    }
    default:
      throw new CliError("Usage: creator assets <plan|generate> <slug>");
  }
}

function edit(argumentsForCommand: readonly string[]): number {
  const [subcommand, slug, ...remaining] = argumentsForCommand;
  if (subcommand !== "plan" || slug === undefined || remaining.length !== 0) {
    throw new CliError("Usage: creator edit plan <slug>");
  }

  const plan = planProjectEdit(slug);
  write(`EDIT_PLAN_READY ${slug} ${plan.timeline.length}`);
  return 0;
}

async function render(argumentsForCommand: readonly string[]): Promise<number> {
  const [subcommand, slug, ...remaining] = argumentsForCommand;
  if (subcommand !== "preview" || slug === undefined || remaining.length !== 0) {
    throw new CliError("Usage: creator render preview <slug>");
  }

  const result = await renderProjectPreview(slug);
  write(`PREVIEW_READY ${slug} ${result.preview_path}`);
  return 0;
}

function requireArgumentCount(command: string, argumentsForCommand: readonly string[], count: number): void {
  if (argumentsForCommand.length !== count) {
    throw new CliError(`Usage: creator ${command}${count === 1 ? " <slug>" : ""}`);
  }
}

function requireMinimumArgumentCount(command: string, argumentsForCommand: readonly string[], count: number): void {
  if (argumentsForCommand.length < count) {
    throw new CliError(`Usage: creator ${command} <slug> <path...>`);
  }
}

function write(message: string): void {
  process.stdout.write(`${message}\n`);
}

function writeError(message: string): void {
  process.stderr.write(`${message}\n`);
}

class CliError extends Error {
  override name = "CliError";
}

void main(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode;
});

export { CliError, main, ProjectStoreError };
