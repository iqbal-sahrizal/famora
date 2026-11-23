import { z } from "zod";

export const createInventoryItemSchema = z.object({
  familyId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  category: z.enum(["pantry", "fridge", "freezer", "cleaning", "medicine", "supplies"]),
  quantity: z.number().min(0).max(10000),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  minThreshold: z.number().min(0).max(10000).default(1),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export const adjustInventorySchema = z.object({
  familyId: z.string().uuid(),
  itemId: z.string().uuid(),
  delta: z.number(),
  reason: z.enum(["restock", "consumed", "expired", "adjustment"]).default("adjustment"),
});

export const createRecipeSchema = z.object({
  familyId: z.string().uuid(),
  title: z.string().trim().min(1).max(140),
  prepMinutes: z.number().int().min(0).max(1440).default(25),
  servings: z.number().int().min(1).max(50).default(4),
  dietaryTags: z.array(z.string().trim()).default([]),
  ingredients: z.array(
    z.object({
      name: z.string().trim().min(1),
      quantity: z.string().default("1"),
      unit: z.string().default("pcs"),
    })
  ),
  instructions: z.string().trim().max(3000).default(""),
});

export const createMealPlanSchema = z.object({
  familyId: z.string().uuid(),
  plannedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealSlot: z.enum(["breakfast", "lunch", "dinner"]),
  recipeId: z.string().uuid().nullable().default(null),
  customTitle: z.string().trim().max(140).default(""),
  preferencesNote: z.string().trim().max(300).default(""),
});

export const createHomeAssetSchema = z.object({
  familyId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  category: z.enum(["appliance", "hvac", "vehicle", "plumbing", "electronics", "structure"]),
  brandModel: z.string().trim().max(120).default(""),
  purchasedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  warrantyExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export const createMaintenanceTaskSchema = z.object({
  familyId: z.string().uuid(),
  assetId: z.string().uuid().nullable().default(null),
  providerId: z.string().uuid().nullable().default(null),
  title: z.string().trim().min(1).max(140),
  intervalDays: z.number().int().min(1).max(3650).default(90),
  nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  syncToCalendar: z.boolean().default(true),
});

export const createServiceProviderSchema = z.object({
  familyId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  specialty: z.string().trim().max(80).default(""),
  phone: z.string().trim().max(40).default(""),
  email: z.string().trim().max(120).default(""),
});
