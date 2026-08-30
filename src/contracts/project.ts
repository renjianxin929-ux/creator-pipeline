import { z } from "zod";

export const projectSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must use lowercase letters, numbers, and hyphens");

export const projectIdentitySchema = z
  .object({
    id: z.string().min(1),
    slug: projectSlugSchema,
    created_at: z.string().datetime({ offset: true }),
    brand_version: z.string().min(1).optional(),
  })
  .strict();

export type ProjectIdentity = z.infer<typeof projectIdentitySchema>;
