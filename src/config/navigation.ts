import type { LucideIcon } from "lucide-react";
import {
  Award,
  Baby,
  BarChart3,
  Bell,
  Calendar,
  CheckSquare,
  FileLock2,
  Flame,
  FolderHeart,
  Home,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Package,
  PieChart,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { DomainId } from "@/types/domain";

export interface NavItemConfig {
  id: DomainId;
  label: string;
  group: "daily" | "household" | "family" | "system";
  icon: LucideIcon;
  mobilePrimary?: boolean;
  mobileLabelKey?: "nav.mobile.home" | "nav.mobile.calendar" | "nav.mobile.tasks" | "nav.mobile.finance";
}

export const DOMAIN_NAV_ITEMS: NavItemConfig[] = [
  { id: "dashboard", label: "Dashboard", group: "daily", icon: LayoutDashboard, mobilePrimary: true, mobileLabelKey: "nav.mobile.home" },
  { id: "calendar", label: "Calendar", group: "daily", icon: Calendar, mobilePrimary: true, mobileLabelKey: "nav.mobile.calendar" },
  { id: "tasks", label: "Tasks & Chores", group: "daily", icon: CheckSquare, mobilePrimary: true, mobileLabelKey: "nav.mobile.tasks" },
  { id: "chores", label: "Chores & Rewards", group: "daily", icon: Award },
  { id: "shopping", label: "Shopping", group: "daily", icon: ShoppingBag },
  { id: "noticeboard", label: "Noticeboard", group: "daily", icon: Megaphone },
  { id: "chat", label: "Family Chat", group: "daily", icon: MessageCircle },

  { id: "finance", label: "Finance", group: "household", icon: Wallet, mobilePrimary: true, mobileLabelKey: "nav.mobile.finance" },
  { id: "budgets", label: "Budgets & Bills", group: "household", icon: PieChart },
  { id: "analytics", label: "Analytics & Goals", group: "household", icon: BarChart3 },
  { id: "meals", label: "Meal Planning", group: "household", icon: UtensilsCrossed },
  { id: "inventory", label: "Inventory", group: "household", icon: Package },
  { id: "home", label: "Home Mgmt", group: "household", icon: Home },
  { id: "documents", label: "Documents", group: "household", icon: FileLock2 },

  { id: "child-dev", label: "Child Dev", group: "family", icon: Baby },
  { id: "habits", label: "Habits", group: "family", icon: Flame },
  { id: "memories", label: "Memories", group: "family", icon: FolderHeart },
  { id: "safety", label: "Family Safety", group: "family", icon: ShieldAlert },

  { id: "ai", label: "AI Assistant", group: "system", icon: Sparkles },
  { id: "notifications", label: "Notifications", group: "system", icon: Bell },
  { id: "family", label: "Family Members", group: "system", icon: Users },
  { id: "settings", label: "Settings", group: "system", icon: Settings },
];

export const NAV_GROUP_LABELS: Record<NavItemConfig["group"], string> = {
  daily: "Daily Rhythm",
  household: "Household",
  family: "Family & Care",
  system: "Workspace",
};
