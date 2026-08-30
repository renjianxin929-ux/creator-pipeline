#!/usr/bin/env node

import { runDoctor } from "./doctor.js";
import { ingestMedia } from "../ingest/ingest-media.js";
import { initializeProject, ProjectStoreError, readProjectState } from "../project/project-store.js";

const helpText = `Creator Pipeline P1 CLI

Usage:
  creator doctor
  creator init <slug>
  creator ingest <slug> <path...>
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
      case "ingest":
        requireMinimumArgumentCount(command, argumentsForCommand, 2);
        return ingest(argumentsForCommand[0]!, argumentsForCommand.slice(1));
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
