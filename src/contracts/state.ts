import { z } from "zod";

export const projectStateValues = [
  "CREATED",
  "INGESTED",
  "TRANSCRIBED",
  "ASSET_PLAN_READY",
  "ASSETS_READY",
  "EDIT_PLAN_READY",
  "PREVIEW_READY",
  "HUMAN_APPROVED",
  "EXPORT_READY",
  "PUBLISH_READY",
  "PUBLISHED",
  "WAITING_USER_ACTION",
  "WAITING_PROVIDER",
  "PARTIAL_PUBLISHED",
  "FAILED",
] as const;

export const projectStateValueSchema = z.enum(projectStateValues);
export type ProjectStateValue = z.infer<typeof projectStateValueSchema>;

export const projectStateSchema = z
  .object({
    status: projectStateValueSchema,
  })
  .strict();

export type ProjectState = z.infer<typeof projectStateSchema>;

/**
 * P0 deliberately defines only transitions out of CREATED. Future tickets
 * extend the table instead of bypassing this contract.
 */
export const transitionTable: Readonly<Record<ProjectStateValue, readonly ProjectStateValue[]>> = {
  CREATED: ["INGESTED", "FAILED", "WAITING_USER_ACTION", "WAITING_PROVIDER"],
  INGESTED: [],
  TRANSCRIBED: [],
  ASSET_PLAN_READY: [],
  ASSETS_READY: [],
  EDIT_PLAN_READY: [],
  PREVIEW_READY: [],
  HUMAN_APPROVED: [],
  EXPORT_READY: [],
  PUBLISH_READY: [],
  PUBLISHED: [],
  WAITING_USER_ACTION: [],
  WAITING_PROVIDER: [],
  PARTIAL_PUBLISHED: [],
  FAILED: [],
};

export function assertTransition(from: ProjectStateValue, to: ProjectStateValue): void {
  if (!transitionTable[from].includes(to)) {
    throw new Error(`Illegal project state transition: ${from} -> ${to}`);
  }
}

export function createInitialState(): ProjectState {
  return { status: "CREATED" };
}
