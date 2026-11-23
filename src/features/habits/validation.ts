import { z } from "zod";

export const createHabitSchema = z.object({
  familyId: z.string().uuid(),
  scope: z.enum(["personal", "family_challenge"]).default("personal"),
  category: z.enum([
    "reading",
    "exercise",
    "sleep",
    "mindfulness",
    "learning",
    "routine",
    "other",
  ]),
  title: z.string().trim().min(1, "Title is required.").max(120),
  description: z.string().trim().max(600).default(""),
  cadence: z.enum(["daily", "weekly"]).default("daily"),
  targetPerPeriod: z.number().int().min(1).max(1000).default(1),
  targetUnit: z.enum(["times", "minutes", "pages", "hours"]).default("times"),
  reminderTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .default(null),
});

export const updateHabitSchema = z.object({
  familyId: z.string().uuid(),
  habitId: z.string().uuid(),
  category: z.enum([
    "reading",
    "exercise",
    "sleep",
    "mindfulness",
    "learning",
    "routine",
    "other",
  ]),
  title: z.string().trim().min(1, "Title is required.").max(120),
  description: z.string().trim().max(600).default(""),
  cadence: z.enum(["daily", "weekly"]).default("daily"),
  targetPerPeriod: z.number().int().min(1).max(1000).default(1),
  targetUnit: z.enum(["times", "minutes", "pages", "hours"]).default("times"),
  reminderTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .default(null),
});

export function computeGentleConsistency(params: {
  completedDates: string[];
  windowDays?: number;
  todayIso: string;
}): {
  completionRatePct: number;
  recentDays: Array<{ date: string; completed: boolean }>;
} {
  const windowDays = params.windowDays ?? 7;
  const completedSet = new Set(params.completedDates);
  const base = new Date(`${params.todayIso}T00:00:00Z`);
  const recentDays: Array<{ date: string; completed: boolean }> = [];
  let hits = 0;

  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const completed = completedSet.has(iso);
    if (completed) hits += 1;
    recentDays.push({ date: iso, completed });
  }

  return {
    completionRatePct: Math.round((hits / windowDays) * 100),
    recentDays,
  };
}
