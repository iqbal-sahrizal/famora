import { z } from "zod";

const positiveDecimalString = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid positive amount (max 2 decimals).")
  .refine((v) => Number(v) > 0, "Amount must be greater than zero.");

const nonNegativeDecimalString = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid non-negative amount.");

export const createAccountSchema = z.object({
  familyId: z.string().uuid(),
  name: z.string().trim().min(1, "Account name is required.").max(80),
  accountKind: z.enum(["bank", "cash", "savings", "allowance", "custom"]),
  ownershipScope: z.enum(["family", "personal"]).default("family"),
  currencyCode: z.string().trim().regex(/^[A-Z]{3}$/).default("USD"),
  initialBalance: nonNegativeDecimalString.default("0.00"),
  monthlyBudget: nonNegativeDecimalString.default("0.00"),
});

export const updateFinanceAccountSchema = z.object({
  familyId: z.string().uuid(),
  accountId: z.string().uuid(),
  name: z.string().trim().min(1, "Account name is required.").max(80),
  accountKind: z.enum(["bank", "cash", "savings", "allowance", "custom"]),
  ownershipScope: z.enum(["family", "personal"]).default("family"),
  monthlyBudget: nonNegativeDecimalString.default("0.00"),
});

export const archiveFinanceAccountSchema = z.object({
  familyId: z.string().uuid(),
  accountId: z.string().uuid(),
  archive: z.boolean().default(true),
});

export const recordTransactionSchema = z.object({
  familyId: z.string().uuid(),
  accountId: z.string().uuid(),
  kind: z.enum(["income", "expense", "transfer"]),
  amount: positiveDecimalString,
  merchant: z.string().trim().min(1, "Description or merchant is required.").max(120),
  category: z.string().trim().min(1).max(60).default("General"),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(1000).default(""),
  transferAccountId: z.string().uuid().nullable().default(null),
  attachmentName: z.string().trim().max(160).nullable().default(null),
  idempotencyKey: z.string().min(8).optional(),
});

export const reverseTransactionSchema = z.object({
  familyId: z.string().uuid(),
  transactionId: z.string().uuid(),
  reason: z.string().trim().min(2).max(200),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateFinanceAccountInput = z.infer<typeof updateFinanceAccountSchema>;
export type ArchiveFinanceAccountInput = z.infer<typeof archiveFinanceAccountSchema>;
export type RecordTransactionInput = z.infer<typeof recordTransactionSchema>;
export type ReverseTransactionInput = z.infer<typeof reverseTransactionSchema>;
