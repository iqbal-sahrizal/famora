export type HabitScope = "personal" | "family_challenge";
export type HabitCategory =
  | "reading"
  | "exercise"
  | "sleep"
  | "mindfulness"
  | "learning"
  | "routine"
  | "other";
export type HabitCadence = "daily" | "weekly";
export type HabitUnit = "times" | "minutes" | "pages" | "hours";

export interface HabitItem {
  id: string;
  ownerMemberId: string;
  ownerName: string;
  scope: HabitScope;
  category: HabitCategory;
  title: string;
  description: string;
  cadence: HabitCadence;
  targetPerPeriod: number;
  targetUnit: HabitUnit;
  reminderTime: string | null;
  isActive: boolean;
  todayCompleted: number;
  periodCompleted: number;
  completionRatePct: number;
  recentDays: Array<{ date: string; completed: boolean }>;
}

export interface HabitsPageData {
  canView: boolean;
  canManageAll: boolean;
  currentMemberId: string | null;
  habits: HabitItem[];
}
