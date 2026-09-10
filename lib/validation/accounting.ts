import { z } from "zod";

export const ACCOUNT_GROUPS = ["asset", "liability", "income", "expense", "equity"] as const;
export const ACCOUNT_GROUP_LABELS: Record<(typeof ACCOUNT_GROUPS)[number], string> = {
  asset: "Asset",
  liability: "Liability",
  income: "Income",
  expense: "Expense",
  equity: "Equity",
};

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Enter an account name"),
  group: z.enum(ACCOUNT_GROUPS),
  openingBalance: z.coerce.number().optional(),
});
export type AccountInput = z.infer<typeof accountSchema>;

export const journalLineSchema = z.object({
  accountId: z.string().min(1, "Select an account"),
  debit: z.coerce.number().min(0).optional(),
  credit: z.coerce.number().min(0).optional(),
});

export const manualJournalSchema = z
  .object({
    narration: z.string().trim().min(1, "Enter a narration"),
    lines: z.array(journalLineSchema).min(2, "A journal entry needs at least two lines"),
  })
  .refine(
    (v) => {
      const debit = v.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
      const credit = v.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
      return Math.abs(debit - credit) < 0.01 && debit > 0;
    },
    { message: "Debits and credits must be equal and greater than zero", path: ["lines"] }
  );
export type ManualJournalInput = z.infer<typeof manualJournalSchema>;
