import { z } from "zod";

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "color tokens must use six-digit hex values");

const nonNegativeIntegerSchema = z.number().int().min(0);

export const brandVersionSchema = z
  .string()
  .regex(/^\d+\.\d+(?:\.\d+)?$/, "brand version must use numeric dotted versioning");

export const colorTokensSchema = z
  .object({
    background: hexColorSchema,
    foreground: hexColorSchema,
    accent: hexColorSchema,
  })
  .strict();

export const typographyTokensSchema = z
  .object({
    font_family: z.array(z.string().min(1)).min(1),
    font_weight_regular: z.number().int().min(100).max(900),
    font_weight_semibold: z.number().int().min(100).max(900),
    font_weight_bold: z.number().int().min(100).max(900),
  })
  .strict();

export const spacingTokensSchema = z
  .object({
    xs: nonNegativeIntegerSchema,
    sm: nonNegativeIntegerSchema,
    md: nonNegativeIntegerSchema,
    lg: nonNegativeIntegerSchema,
    xl: nonNegativeIntegerSchema,
  })
  .strict();

export const safeAreaTokensSchema = z
  .object({
    top: nonNegativeIntegerSchema,
    right: nonNegativeIntegerSchema,
    bottom: nonNegativeIntegerSchema,
    left: nonNegativeIntegerSchema,
  })
  .strict();

export const brandTokensSchema = z
  .object({
    colors: colorTokensSchema,
    typography: typographyTokensSchema,
    spacing: spacingTokensSchema,
    safe_area: safeAreaTokensSchema,
  })
  .strict();

export const templateIdValues = [
  "cover.tutorial",
  "cover.opinion",
  "cover.deep-dive",
  "cover.news",
  "caption.default",
  "caption.emphasis",
  "caption.quote",
  "title.hook",
  "title.chapter",
  "title.lower-third",
  "layout.talking-head",
  "layout.screen-demo",
  "layout.split-screen",
  "layout.screenshot",
  "layout.broll",
  "motion.intro",
  "motion.transition",
  "motion.outro",
  "motion.zoom",
] as const;

export const templateIdSchema = z.enum(templateIdValues);
export type TemplateId = z.infer<typeof templateIdSchema>;

const coverTemplateIdSchema = z.enum([
  "cover.tutorial",
  "cover.opinion",
  "cover.deep-dive",
  "cover.news",
]);
const captionTemplateIdSchema = z.enum([
  "caption.default",
  "caption.emphasis",
  "caption.quote",
]);
const titleTemplateIdSchema = z.enum(["title.hook", "title.chapter", "title.lower-third"]);
const layoutTemplateIdSchema = z.enum([
  "layout.talking-head",
  "layout.screen-demo",
  "layout.split-screen",
  "layout.screenshot",
  "layout.broll",
]);
const motionTemplateIdSchema = z.enum([
  "motion.intro",
  "motion.transition",
  "motion.outro",
  "motion.zoom",
]);

export const brandTemplateRegistrySchema = z
  .object({
    ids: z
      .array(templateIdSchema)
      .length(templateIdValues.length)
      .refine(
        (ids) =>
          new Set(ids).size === templateIdValues.length &&
          templateIdValues.every((templateId) => ids.includes(templateId)),
        "templates must contain every required template id exactly once",
      ),
  })
  .strict();

export const brandTemplateDefaultsSchema = z
  .object({
    cover: coverTemplateIdSchema,
    caption: captionTemplateIdSchema,
    title: titleTemplateIdSchema,
    layout: layoutTemplateIdSchema,
    motion: motionTemplateIdSchema,
  })
  .strict();

export const brandDefaultsSchema = z
  .object({
    templates: brandTemplateDefaultsSchema,
    cover_title_size: z.number().int().positive(),
    caption_max_lines: z.number().int().min(1),
  })
  .strict();

export const brandKitSchema = z
  .object({
    brand_version: brandVersionSchema,
    tokens: brandTokensSchema,
    templates: brandTemplateRegistrySchema,
    defaults: brandDefaultsSchema,
  })
  .strict();

export type BrandKit = z.infer<typeof brandKitSchema>;

const colorTokenOverrideSchema = colorTokensSchema.partial().strict();
const typographyTokenOverrideSchema = typographyTokensSchema.partial().strict();
const spacingTokenOverrideSchema = spacingTokensSchema.partial().strict();
const safeAreaTokenOverrideSchema = safeAreaTokensSchema.partial().strict();

/**
 * Project-local presentation adjustments. The shape is intentionally bounded:
 * callers can replace existing values, but cannot add new official tokens.
 */
export const brandOverrideSchema = z
  .object({
    colors: colorTokenOverrideSchema.optional(),
    typography: typographyTokenOverrideSchema.optional(),
    spacing: spacingTokenOverrideSchema.optional(),
    safe_area: safeAreaTokenOverrideSchema.optional(),
    cover_title_size: z.number().int().positive().optional(),
    caption_max_lines: z.number().int().min(1).optional(),
  })
  .strict();

export type BrandOverride = z.infer<typeof brandOverrideSchema>;
export type ResolvedBrand = BrandKit;

/**
 * Resolves a project override into a new brand snapshot. It performs no I/O and
 * never mutates the versioned kit passed by the caller.
 */
export function resolveBrand(kitInput: BrandKit, overrideInput: BrandOverride = {}): ResolvedBrand {
  const kit = brandKitSchema.parse(kitInput);
  const override = brandOverrideSchema.parse(overrideInput);
  const typography = {
    ...kit.tokens.typography,
    ...override.typography,
  };

  return brandKitSchema.parse({
    brand_version: kit.brand_version,
    tokens: {
      colors: {
        ...kit.tokens.colors,
        ...override.colors,
      },
      typography: {
        ...typography,
        font_family: [...typography.font_family],
      },
      spacing: {
        ...kit.tokens.spacing,
        ...override.spacing,
      },
      safe_area: {
        ...kit.tokens.safe_area,
        ...override.safe_area,
      },
    },
    templates: {
      ids: [...kit.templates.ids],
    },
    defaults: {
      templates: {
        ...kit.defaults.templates,
      },
      cover_title_size: override.cover_title_size ?? kit.defaults.cover_title_size,
      caption_max_lines: override.caption_max_lines ?? kit.defaults.caption_max_lines,
    },
  });
}
