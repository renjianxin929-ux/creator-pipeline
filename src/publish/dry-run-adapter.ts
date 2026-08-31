import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  platformIdSchema,
  publishResultSchema,
  publishValidationSchema,
  type PlatformId,
  type PublishPackage,
  type PublishResult,
  type PublishTarget,
  type PublishValidation,
} from "../contracts/publish.js";
import type { PublisherAdapter } from "./types.js";

export interface DryRunPublisherAdapterOptions {
  results_directory: string;
  /** Explicit test fake override. Production defaults to the opt-in env flag. */
  enabled?: boolean;
}

export class PublisherAdapterError extends Error {
  override name = "PublisherAdapterError";
}

/**
 * The only P7 publisher implementation. It never imports HTTP, browser, or
 * credential APIs; it writes a local structured result instead.
 */
export class DryRunPublisherAdapter implements PublisherAdapter {
  readonly id: PlatformId;
  readonly #resultsDirectory: string;
  readonly #enabled: boolean;

  constructor(id: PlatformId, options: DryRunPublisherAdapterOptions) {
    this.id = platformIdSchema.parse(id);
    this.#resultsDirectory = options.results_directory;
    this.#enabled = options.enabled ?? process.env.CREATOR_PUBLISH_DRY_RUN === "1";
  }

  async available(): Promise<boolean> {
    return this.#enabled;
  }

  async validate(publishPackage: PublishPackage, target: PublishTarget): Promise<PublishValidation> {
    const errors: string[] = [];

    if (target.platform !== this.id) {
      errors.push(`Target platform ${target.platform} does not match adapter ${this.id}`);
    }
    if (!target.dry_run) {
      errors.push("P7 publisher adapters only accept dry_run targets");
    }
    if (publishPackage.media_path !== target.media_path) {
      errors.push("Publish target media_path must match the package media_path");
    }

    return publishValidationSchema.parse({ valid: errors.length === 0, errors });
  }

  async publish(publishPackage: PublishPackage, target: PublishTarget): Promise<PublishResult> {
    if (!(await this.available())) {
      throw new PublisherAdapterError(
        "Dry-run publisher is disabled; set CREATOR_PUBLISH_DRY_RUN=1 or use an explicit test fake.",
      );
    }

    const validation = await this.validate(publishPackage, target);
    if (!validation.valid) {
      return this.writeResult({
        platform: this.id,
        status: "rejected",
        dry_run: true,
        platform_ids: [],
        error: validation.errors.join("; "),
      });
    }

    return this.writeResult({
      platform: this.id,
      status: "accepted",
      dry_run: true,
      platform_ids: [],
      error: null,
    });
  }

  private writeResult(result: PublishResult): PublishResult {
    const parsed = publishResultSchema.parse(result);
    mkdirSync(this.#resultsDirectory, { recursive: true });
    writeFileSync(
      join(this.#resultsDirectory, `${this.id}.json`),
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf8",
    );
    return parsed;
  }
}
