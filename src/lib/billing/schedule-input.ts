import * as z from "zod";

/** Payment schedule input, shared by the billing service and assistant plans. */
export const scheduleInput = z.object({
  /** Project value in minor units. */
  value: z.number().int().positive().max(9_000_000_000_000_000),
  terms: z
    .array(
      z
        .object({
          label: z.string().trim().min(1).max(80),
          percentBp: z.number().int().min(1).max(10_000).nullable().optional(),
          amount: z.number().int().positive().nullable().optional(),
          dueDate: z.iso.date().nullable().optional(),
        })
        .refine((t) => (t.percentBp != null) !== (t.amount != null), {
          message: "percentOrAmount",
        }),
    )
    .max(24),
});
export type ScheduleInput = z.output<typeof scheduleInput>;
