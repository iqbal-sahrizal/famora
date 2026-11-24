import { z } from "zod";

export const createShoppingListSchema = z.object({
  familyId: z.string().uuid(),
  name: z.string().trim().min(1, "List name is required.").max(100),
  storeName: z.string().trim().max(100).default(""),
  assignedShopperMemberId: z.string().uuid().nullable().default(null),
});

export const updateShoppingListSchema = z.object({
  familyId: z.string().uuid(),
  listId: z.string().uuid(),
  name: z.string().trim().min(1, "List name is required.").max(100),
  storeName: z.string().trim().max(100).default(""),
  assignedShopperMemberId: z.string().uuid().nullable().default(null),
});

export const deleteShoppingListSchema = z.object({
  familyId: z.string().uuid(),
  listId: z.string().uuid(),
});

export const addShoppingItemSchema = z.object({
  familyId: z.string().uuid(),
  listId: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1, "Item name is required.").max(120),
  category: z.string().trim().min(1).max(50).default("Groceries"),
  quantity: z.string().trim().min(1).max(30).default("1"),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  estimatedPriceCents: z.number().int().min(0).max(100_000_000).default(0),
  notes: z.string().trim().max(300).default(""),
  assignedShopperMemberId: z.string().uuid().nullable().default(null),
  clientMutationId: z.string().min(8).optional(),
});

export const toggleShoppingCheckSchema = z.object({
  familyId: z.string().uuid(),
  itemId: z.string().uuid(),
  isChecked: z.boolean(),
  financeAccountId: z.string().uuid().nullable().optional(),
});

export const updateShoppingQuantitySchema = z.object({
  familyId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantity: z.string().trim().min(1).max(30),
});

export const updateShoppingItemSchema = z.object({
  familyId: z.string().uuid(),
  itemId: z.string().uuid(),
  name: z.string().trim().min(1, "Item name is required.").max(120),
  category: z.string().trim().min(1).max(50).default("Groceries"),
  quantity: z.string().trim().min(1).max(30).default("1"),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  estimatedPriceCents: z.number().int().min(0).max(100_000_000).default(0),
  notes: z.string().trim().max(300).default(""),
});

export const deleteShoppingItemSchema = z.object({
  familyId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export const saveTemplateSchema = z.object({
  familyId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  items: z.array(
    z.object({
      name: z.string().trim().min(1),
      category: z.string().default("Groceries"),
      quantity: z.string().default("1"),
      unit: z.string().default("pcs"),
    })
  ),
});

export type CreateShoppingListInput = z.infer<typeof createShoppingListSchema>;
export type UpdateShoppingListInput = z.infer<typeof updateShoppingListSchema>;
export type DeleteShoppingListInput = z.infer<typeof deleteShoppingListSchema>;
export type AddShoppingItemInput = z.infer<typeof addShoppingItemSchema>;
export type ToggleShoppingCheckInput = z.infer<typeof toggleShoppingCheckSchema>;
export type UpdateShoppingQuantityInput = z.infer<typeof updateShoppingQuantitySchema>;
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;
export type DeleteShoppingItemInput = z.infer<typeof deleteShoppingItemSchema>;
export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>;
