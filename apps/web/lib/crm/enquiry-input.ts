import { z } from "zod";
import { APARTMENT_TYPE_VALUES, BUDGET_RANGE_VALUES } from "./enquiry-options";

// Keep aligned with landing-site/lib/enquiry.ts. createdAt is the saved enquiry time.
export const landingEnquiryInput = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().min(1).max(254).email(),
  phone: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^\+?[\d\s().-]+$/)
    .refine((value) => {
      const count = value.replace(/\D/g, "").length;
      return count >= 8 && count <= 15;
    }),
  address: z.string().trim().min(1).max(500),
  apartmentType: z.string().trim().pipe(z.enum(APARTMENT_TYPE_VALUES)),
  budget: z.string().trim().pipe(z.enum(BUDGET_RANGE_VALUES)),
  message: z.string().trim().max(5000).default(""),
  createdAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value).toISOString()),
});

export type LandingEnquiry = z.infer<typeof landingEnquiryInput>;
