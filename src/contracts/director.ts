import { z } from "zod";

import { brandVersionSchema } from "./brand.js";
import { sha256Schema } from "./media.js";
import { projectSlugSchema } from "./project.js";

export const semanticRoleValues = [
  "HOOK",
  "CLAIM",
  "PROBLEM",
  "PROOF",
  "DEMO_ACTION",
  "RESULT",
  "CONTRAST",
  "CONCEPT",
  "TRANSITION",
  "CTA",
] as const;

export const semanticRoleSchema = z.enum(semanticRoleValues);
export type SemanticRole = z.infer<typeof semanticRoleSchema>;

export const visualChoiceValues = [
  "talking_head",
  "screen_demo",
  "screenshot",
  "split_screen",
  "broll",
  "text_card",
  "motion_explainer",
  "none",
] as const;

export const visualChoiceSchema = z.enum(visualChoiceValues);
export type VisualChoice = z.infer<typeof visualChoiceSchema>;

export const captionModeValues = ["off", "default", "emphasis", "quote"] as const;
export const captionModeSchema = z.enum(captionModeValues);
export type CaptionMode = z.infer<typeof captionModeSchema>;

export const stylePatternIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,
    "style pattern ids must be lowercase stable identifiers",
  );

const uniqueValues = <T>(values: readonly T[]): boolean => new Set(values).size === values.length;

export const styleManifestSchema = z
  .object({
    version: z.literal(1),
    style_version: brandVersionSchema,
    visual_choices: z
      .array(visualChoiceSchema)
      .min(1)
      .refine(uniqueValues, "visual_choices must not contain duplicates"),
    caption_modes: z
      .array(captionModeSchema)
      .min(1)
      .refine(uniqueValues, "caption_modes must not contain duplicates"),
    motion_ids: z
      .array(stylePatternIdSchema)
      .refine(uniqueValues, "motion_ids must not contain duplicates"),
  })
  .strict();

export type StyleManifest = z.infer<typeof styleManifestSchema>;

export const frozenScriptIdentitySchema = z
  .object({
    path: z.literal("content/frozen-script.md"),
    sha256: sha256Schema,
  })
  .strict();

export type FrozenScriptIdentity = z.infer<typeof frozenScriptIdentitySchema>;

export const directorTimeRangeSchema = z
  .object({
    start_ms: z.number().int().min(0),
    end_ms: z.number().int().positive(),
  })
  .strict()
  .refine((range) => range.end_ms > range.start_ms, {
    message: "director time range end_ms must be greater than start_ms",
    path: ["end_ms"],
  });

export const directorScriptRangeSchema = z
  .object({
    start_char: z.number().int().min(0),
    end_char: z.number().int().positive(),
    quote: z.string().min(1).optional(),
  })
  .strict()
  .refine((range) => range.end_char > range.start_char, {
    message: "director script range end_char must be greater than start_char",
    path: ["end_char"],
  });

export const directorVisualPolicySchema = z
  .object({
    selected: visualChoiceSchema,
    allowed: z.array(visualChoiceSchema).min(1),
    forbidden: z.array(visualChoiceSchema).default([]),
  })
  .strict()
  .superRefine((policy, context) => {
    if (!uniqueValues(policy.allowed)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowed"],
        message: "allowed visual choices must not contain duplicates",
      });
    }
    if (!uniqueValues(policy.forbidden)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["forbidden"],
        message: "forbidden visual choices must not contain duplicates",
      });
    }
    if (!policy.allowed.includes(policy.selected)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selected"],
        message: "selected visual choice must be present in allowed",
      });
    }
    if (policy.forbidden.includes(policy.selected)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selected"],
        message: "selected visual choice must not be forbidden",
      });
    }
    const overlap = policy.allowed.filter((choice) => policy.forbidden.includes(choice));
    if (overlap.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["forbidden"],
        message: `visual choices cannot be both allowed and forbidden: ${overlap.join(", ")}`,
      });
    }
  });

export const directorCaptionDecisionSchema = z
  .object({
    mode: captionModeSchema,
    emphasis: z.array(z.string().trim().min(1)).max(12).default([]),
  })
  .strict()
  .superRefine((caption, context) => {
    if (caption.mode === "off" && caption.emphasis.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["emphasis"],
        message: "caption emphasis must be empty when caption mode is off",
      });
    }
  });

export const directorPlanSegmentSchema = z
  .object({
    id: z.string().min(1),
    semantic_role: semanticRoleSchema,
    time_range: directorTimeRangeSchema,
    script_range: directorScriptRangeSchema.optional(),
    visual: directorVisualPolicySchema,
    caption: directorCaptionDecisionSchema,
    motion_id: stylePatternIdSchema.optional(),
    reason: z.string().trim().min(1),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type DirectorPlanSegment = z.infer<typeof directorPlanSegmentSchema>;

export const directorPlanSchema = z
  .object({
    version: z.literal(1),
    project_slug: projectSlugSchema,
    source_script: frozenScriptIdentitySchema,
    style: z
      .object({
        style_version: brandVersionSchema,
      })
      .strict(),
    created_at: z.string().datetime(),
    segments: z.array(directorPlanSegmentSchema).min(1),
  })
  .strict()
  .superRefine((plan, context) => {
    const seenIds = new Set<string>();
    let previousEndMs = -1;

    for (const [index, segment] of plan.segments.entries()) {
      if (seenIds.has(segment.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "id"],
          message: `duplicate director segment id: ${segment.id}`,
        });
      }
      seenIds.add(segment.id);

      if (segment.time_range.start_ms < previousEndMs) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", index, "time_range", "start_ms"],
          message: "director segments must be ordered and non-overlapping",
        });
      }
      previousEndMs = segment.time_range.end_ms;
    }
  });

export type DirectorPlan = z.infer<typeof directorPlanSchema>;

export function isDirectorPlanStale(planInput: DirectorPlan, currentScriptSha256Input: string): boolean {
  const plan = directorPlanSchema.parse(planInput);
  const currentScriptSha256 = sha256Schema.parse(currentScriptSha256Input);
  return plan.source_script.sha256 !== currentScriptSha256;
}

/**
 * Cross-reference validation stays pure and vendor-independent. P9.2 can load
 * the repository Style OS and pass its manifest here without changing the
 * Director Plan contract.
 */
export function validateDirectorPlanAgainstStyle(
  planInput: DirectorPlan,
  manifestInput: StyleManifest,
): DirectorPlan {
  const plan = directorPlanSchema.parse(planInput);
  const manifest = styleManifestSchema.parse(manifestInput);

  if (plan.style.style_version !== manifest.style_version) {
    throw new Error(
      `Director Plan style version ${plan.style.style_version} does not match Style Manifest ${manifest.style_version}`,
    );
  }

  for (const segment of plan.segments) {
    const referencedVisuals = [
      segment.visual.selected,
      ...segment.visual.allowed,
      ...segment.visual.forbidden,
    ];
    for (const visualChoice of referencedVisuals) {
      if (!manifest.visual_choices.includes(visualChoice)) {
        throw new Error(
          `Director segment ${segment.id} references unsupported visual choice: ${visualChoice}`,
        );
      }
    }

    if (!manifest.caption_modes.includes(segment.caption.mode)) {
      throw new Error(
        `Director segment ${segment.id} references unsupported caption mode: ${segment.caption.mode}`,
      );
    }

    if (segment.motion_id !== undefined && !manifest.motion_ids.includes(segment.motion_id)) {
      throw new Error(
        `Director segment ${segment.id} references unsupported motion id: ${segment.motion_id}`,
      );
    }
  }

  return plan;
}
