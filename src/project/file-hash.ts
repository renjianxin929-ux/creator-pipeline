import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Server-only file hashing for byte-identity checks at project boundaries. */
export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
