import { z } from "zod";

/**
 * These IDs are intentionally stable contract values. In particular, grok_ui
 * consumes a Founder-managed web/app subscription path while grok_api uses
 * separately billed xAI API access.
 */
export const generatedAssetProviderIdValues = [
  "grok_ui",
  "grok_api",
  "minimax_api",
  "omni_ui",
  "manual",
] as const;

export const generatedAssetProviderIdSchema = z.enum(generatedAssetProviderIdValues);
export type GeneratedAssetProviderId = z.infer<typeof generatedAssetProviderIdSchema>;

export const assetPriorityValues = ["low", "medium", "high"] as const;
export const assetPrioritySchema = z.enum(assetPriorityValues);
export type AssetPriority = z.infer<typeof assetPrioritySchema>;

export const assetTimelineHintSchema = z
  .object({
    start_ms: z.number().int().nonnegative(),
    end_ms: z.number().int().nonnegative(),
  })
  .strict()
  .refine((hint) => hint.end_ms > hint.start_ms, {
    message: "timeline_hint.end_ms must be greater than timeline_hint.start_ms",
    path: ["end_ms"],
  });

export type AssetTimelineHint = z.infer<typeof assetTimelineHintSchema>;

export const assetGenerationSchema = z
  .object({
    provider_preference: z
      .array(generatedAssetProviderIdSchema)
      .min(1)
      .refine((providers) => new Set(providers).size === providers.length, {
        message: "provider_preference must not repeat a provider",
      }),
    max_attempts: z.number().int().min(1),
    cash_budget_cny: z.number().finite().nonnegative(),
  })
  .strict();

export type AssetGeneration = z.infer<typeof assetGenerationSchema>;

export const assetRequestSchema = z
  .object({
    asset_id: z.string().min(1),
    timeline_hint: assetTimelineHintSchema.optional(),
    purpose: z.string().min(1),
    priority: assetPrioritySchema,
    description: z.string().min(1),
    preferred_source: z.string().min(1),
    fallback_source: z.string().min(1),
    generation: assetGenerationSchema.optional(),
  })
  .strict();

export type AssetRequest = z.infer<typeof assetRequestSchema>;

export const assetPlanSchema = z
  .object({
    version: z.literal(1),
    project_slug: z.string().min(1),
    generated_at: z.string().datetime({ offset: true }),
    requests: z.array(assetRequestSchema),
  })
  .strict();

export type AssetPlan = z.infer<typeof assetPlanSchema>;

export const assetManifestSourceValues = [
  "existing",
  "brand",
  "grok_ui",
  "grok_api",
  "minimax_api",
  "omni_ui",
  "manual",
] as const;

export const assetManifestSourceSchema = z.enum(assetManifestSourceValues);
export type AssetManifestSource = z.infer<typeof assetManifestSourceSchema>;

export const assetManifestTypeValues = ["video", "image", "audio", "other"] as const;
export const assetManifestTypeSchema = z.enum(assetManifestTypeValues);
export type AssetManifestType = z.infer<typeof assetManifestTypeSchema>;

export const assetGenerationMetadataSchema = z
  .object({
    attempt: z.number().int().min(1),
    cash_cost_cny: z.number().finite().nonnegative(),
    subscription_quota_used: z.boolean(),
  })
  .strict();

export type AssetGenerationMetadata = z.infer<typeof assetGenerationMetadataSchema>;

export const assetManifestRecordSchema = z
  .object({
    asset_id: z.string().min(1),
    type: assetManifestTypeSchema,
    source: assetManifestSourceSchema,
    role: z.string().min(1),
    path: z.string().min(1),
    duration_ms: z.number().int().nonnegative().optional(),
    has_watermark: z.boolean(),
    // Safe by default. This means omni_ui assets remain non-final unless a
    // later Founder-review flow explicitly promotes them.
    final_eligible: z.boolean().default(false),
    generation: assetGenerationMetadataSchema.optional(),
  })
  .strict();

export type AssetManifestRecord = z.infer<typeof assetManifestRecordSchema>;

export const assetManifestSchema = z
  .object({
    version: z.literal(1),
    assets: z.array(assetManifestRecordSchema),
  })
  .strict();

export type AssetManifest = z.infer<typeof assetManifestSchema>;

export const DEFAULT_GENERATION_CASH_BUDGET_CNY = 10;

export const projectGenerationBudgetSchema = z
  .object({
    generation_cash_cny: z.number().finite().nonnegative().default(DEFAULT_GENERATION_CASH_BUDGET_CNY),
    used_cash_cny: z.number().finite().nonnegative().default(0),
    subscription_generation_count: z.number().int().nonnegative().default(0),
  })
  .strict()
  .refine((budget) => budget.used_cash_cny <= budget.generation_cash_cny, {
    message: "used_cash_cny cannot exceed generation_cash_cny",
    path: ["used_cash_cny"],
  });

export type ProjectGenerationBudget = z.infer<typeof projectGenerationBudgetSchema>;

export function createDefaultProjectGenerationBudget(): ProjectGenerationBudget {
  return projectGenerationBudgetSchema.parse({});
}
