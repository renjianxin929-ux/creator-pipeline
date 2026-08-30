import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import { resolveWorkspaceRoot } from "../project/project-store.js";

export type DoctorLevel = "PASS" | "WARN" | "MISSING";

export interface DoctorCheck {
  level: DoctorLevel;
  name: string;
  detail: string;
}

export interface DoctorReport {
  checks: readonly DoctorCheck[];
  ok: boolean;
}

export function runDoctor(cwd = process.cwd()): DoctorReport {
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const hasMiniMaxKey = Boolean(process.env.MINIMAX_API_KEY);

  const checks: DoctorCheck[] = [
    nodeMajor >= 20
      ? { level: "PASS", name: "node", detail: `v${process.versions.node}` }
      : { level: "MISSING", name: "node", detail: `>=20 required; found v${process.versions.node}` },
    commandIsAvailable("ffmpeg")
      ? { level: "PASS", name: "ffmpeg", detail: "available" }
      : { level: "WARN", name: "ffmpeg", detail: "unavailable; required from P5" },
    commandIsAvailable("ffprobe")
      ? { level: "PASS", name: "ffprobe", detail: "available" }
      : { level: "WARN", name: "ffprobe", detail: "unavailable; required from P1" },
    existsSync(workspaceRoot)
      ? { level: "PASS", name: "workspace", detail: workspaceRoot }
      : { level: "WARN", name: "workspace", detail: `${workspaceRoot} (created by creator init)` },
    hasMiniMaxKey
      ? { level: "PASS", name: "minimax", detail: "configured" }
      : { level: "WARN", name: "minimax", detail: "disabled; MINIMAX_API_KEY is not configured" },
  ];

  return {
    checks,
    ok: checks.every((check) => check.level !== "MISSING"),
  };
}

function commandIsAvailable(command: string): boolean {
  const result = spawnSync(command, ["-version"], {
    stdio: "ignore",
    windowsHide: true,
  });

  return result.error === undefined;
}
