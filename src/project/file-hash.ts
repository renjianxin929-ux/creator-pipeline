import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Hashes in-memory bytes with the same sha256 mechanism used for files. */
export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Server-only file hashing for byte-identity checks at project boundaries. */
export function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}
