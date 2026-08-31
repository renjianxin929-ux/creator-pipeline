import type {
  PlatformId,
  PublishPackage,
  PublishResult,
  PublishTarget,
  PublishValidation,
} from "../contracts/publish.js";

/**
 * Publisher implementations are replaceable. P7 ships only a local dry-run
 * implementation; live API and browser adapters remain deliberately absent.
 */
export interface PublisherAdapter {
  readonly id: PlatformId;
  available(): Promise<boolean>;
  validate(publishPackage: PublishPackage, target: PublishTarget): Promise<PublishValidation>;
  publish(publishPackage: PublishPackage, target: PublishTarget): Promise<PublishResult>;
}
