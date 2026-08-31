import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { previewApprovalSchema } from "../src/contracts/approval.ts";
import { sha256File } from "../src/project/file-hash.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("P6 approval contract", () => {
  it("uses preview bytes, not the filename, as the approval identity", () => {
    const directory = createTemporaryDirectory();
    const previewPath = join(directory, "preview.mp4");
    const renamedPreviewPath = join(directory, "renamed-preview.mp4");
    writeFileSync(previewPath, Buffer.from([0, 1, 2, 3]));
    writeFileSync(renamedPreviewPath, Buffer.from([0, 1, 2, 3]));

    const previewSha256 = sha256File(previewPath);
    expect(sha256File(renamedPreviewPath)).toBe(previewSha256);

    writeFileSync(previewPath, Buffer.from([0, 1, 2, 4]));
    expect(sha256File(previewPath)).not.toBe(previewSha256);
  });

  it("accepts only a structured approval fact", () => {
    const approval = {
      preview_path: "render/preview.mp4",
      preview_sha256: "a".repeat(64),
      approved_at: "2026-08-31T00:00:00.000Z",
      approved_by: "founder",
      edit_plan_sha256: "b".repeat(64),
      notes: "Approved for export.",
    };

    expect(previewApprovalSchema.parse(approval)).toEqual(approval);
    expect(() => previewApprovalSchema.parse({ ...approval, approved: true })).toThrow();
    expect(() => previewApprovalSchema.parse({ ...approval, preview_sha256: "preview.mp4" })).toThrow();
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "creator-pipeline-approval-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
