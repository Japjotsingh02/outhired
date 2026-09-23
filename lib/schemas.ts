import { z } from "zod";
import { validatePostedMonth } from "@/lib/postedMonth";

export const GeminiExtractionSchema = z.object({
  role: z.string().trim().min(1).max(200).nullable().optional(),
  team: z.string().trim().min(1).max(100).nullable().optional(),
  company: z.string().trim().min(1).max(200).nullable().optional(),
  location: z.string().trim().min(1).max(200).nullable().optional(),
  datePosted: z.string().trim().min(1).max(60).nullable().optional(),
  locationType: z.enum(["remote", "hybrid", "onsite"]).nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(50)).default([]),
});

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

/** Trims and collapses whitespace so the Job unique constraint is meaningful. */
const requiredText = (max: number) =>
  z
    .string()
    .transform(collapseWhitespace)
    .pipe(z.string().min(1, "Required").max(max, `Must be ${max} characters or fewer`));

const optionalText = (max: number) =>
  z
    .string()
    .transform(collapseWhitespace)
    .pipe(z.string().max(max, `Must be ${max} characters or fewer`))
    .optional();

/** Body of POST /api/jobs. Seniority is deliberately absent: the server derives it. */
export const CreateJobSchema = z.object({
  role: requiredText(200),
  company: requiredText(200),
  datePosted: z
    .string()
    .regex(/^\d{4}-\d{2}-01$/, "datePosted must be YYYY-MM-01")
    .superRefine((value, ctx) => {
      const message = validatePostedMonth(value);
      if (message) ctx.addIssue({ code: "custom", message });
    }),
  team: optionalText(100),
  skills: z.array(z.string().trim().min(1).max(50)).max(30),
  location: optionalText(200),
  inputMode: z.enum(["URL", "DESCRIPTION", "MANUAL"]),
  sourceUrl: z
    .url()
    .max(2000)
    .refine((value) => /^https?:\/\//i.test(value), "sourceUrl must be http(s)")
    .optional(),
});
export type CreateJobInput = z.infer<typeof CreateJobSchema>;
