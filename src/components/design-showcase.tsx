"use client";

import * as React from "react";
import {
  Bell,
  CalendarDays,
  Check,
  Edit3,
  HeartHandshake,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BudgetRing, SpendBarChart } from "@/components/ui/charts";
import { DatePicker } from "@/components/ui/date-picker";
import { BottomSheet, Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { NavigationPreview, ThemeToggle } from "@/components/ui/navigation";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/utils";

const SWATCHES = [
  { name: "Warm White", hex: "#F7F5EF", role: "Canvas", text: "#282C29" },
  { name: "Sage Green", hex: "#DCE8D9", role: "Positive / Nature", text: "#234234" },
  { name: "Forest Green", hex: "#315C49", role: "Primary Brand", text: "#F7F5EF" },
  { name: "Soft Peach", hex: "#E9B98B", role: "Warmth / Rewards", text: "#5C3B1C" },
  { name: "Muted Lavender", hex: "#E9DDF5", role: "AI & Habits", text: "#46325C" },
  { name: "Soft Blush", hex: "#F3D9D1", role: "Care & Memories", text: "#633226" },
  { name: "Charcoal", hex: "#282C29", role: "Primary Ink", text: "#F7F5EF" },
];

const MONTHLY_SPEND = [
  { label: "Jun", amountCents: 312000 },
  { label: "Jul", amountCents: 289000 },
  { label: "Aug", amountCents: 345000 },
  { label: "Sep", amountCents: 274000 },
  { label: "Oct", amountCents: 298500 },
  { label: "Nov", amountCents: 241000 },
];

const LEDGER_ROWS = [
  {
    id: "tx-1",
    merchant: "Green Valley Market",
    category: "Groceries",
    member: "Maya",
    date: "Nov 22",
    amountCents: -12480,
    tone: "sage" as const,
  },
  {
    id: "tx-2",
    merchant: "City Pediatric Clinic",
    category: "Health",
    member: "Daniel",
    date: "Nov 20",
    amountCents: -6500,
    tone: "blush" as const,
  },
  {
    id: "tx-3",
    merchant: "Leo Allowance Credit",
    category: "Allowance",
    member: "Leo",
    date: "Nov 18",
    amountCents: 2500,
    tone: "peach" as const,
  },
];

export function DesignShowcase() {
  const [activeNav, setActiveNav] = React.useState("home");
  const [activeTab, setActiveTab] = React.useState("overview");
  const [selectedDate, setSelectedDate] = React.useState(new Date(2026, 10, 22));
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [eventTitle, setEventTitle] = React.useState("");
  const [eventNotes, setEventNotes] = React.useState("");
  const [itemName, setItemName] = React.useState("");
  const [itemNotes, setItemNotes] = React.useState("");
  const [isLoadingBtn, setIsLoadingBtn] = React.useState(false);

  const triggerLoading = () => {
    setIsLoadingBtn(true);
    setTimeout(() => {
      setIsLoadingBtn(false);
      toast.success("Family preferences saved");
    }, 900);
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Sticky Minimal Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]">
              <HeartHandshake className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <span className="font-heading text-[17px] font-bold tracking-tight">
                Famora
              </span>
              <span className="ml-2 rounded-full bg-[var(--tint-sage)] px-2 py-0.5 text-[11px] font-medium text-[var(--tint-sage-fg)]">
                Design System v1.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Tooltip content="Trigger sample notification">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Test toast notification"
                onClick={() =>
                  toast("Dinner prep reminder", {
                    description: "Roast vegetables starts at 5:30 PM",
                  })
                }
              >
                <Bell className="h-4 w-4" />
              </Button>
            </Tooltip>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-16 px-6 pt-12">
        {/* Editorial Hero */}
        <section className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-end">
          <div className="space-y-4">
            <Badge variant="lavender">
              <Sparkles className="h-3.5 w-3.5" />
              Warm Clarity Design Language
            </Badge>
            <h1 className="font-heading text-[32px] font-bold leading-[1.15] sm:text-[40px]">
              Designed to feel like home, engineered with fintech precision.
            </h1>
            <p className="max-w-2xl text-[15.5px] leading-relaxed text-[var(--text-secondary)]">
              A calm, tactile component system built on Warm White, Forest Green,
              and organic botanical tints—supporting both light and dark modes with
              tabular numeric clarity.
            </p>
          </div>

          <Card variant="sage" className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[12.5px] font-medium opacity-80">
                Active Household
              </p>
              <p className="font-heading text-[20px] font-semibold">
                The Rivera Family
              </p>
              <p className="mt-1 text-[13px] opacity-80">
                4 members · Multi-family ready
              </p>
            </div>
            <AvatarStack
              size="md"
              members={[
                { name: "Maya Rivera", tone: "forest" },
                { name: "Daniel Rivera", tone: "peach" },
                { name: "Leo Rivera", tone: "lavender" },
                { name: "Nora Rivera", tone: "blush" },
              ]}
            />
          </Card>
        </section>

        {/* 1. Color System */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-heading text-[22px] font-semibold">
                Color Palette & Semantic Tints
              </h2>
              <p className="text-[14px] text-[var(--text-secondary)]">
                Toggle the theme in the header to verify light and dark token
                adaptations.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {SWATCHES.map((swatch) => (
              <div
                key={swatch.hex}
                className="overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
              >
                <div
                  className="flex h-20 items-end p-3"
                  style={{ backgroundColor: swatch.hex, color: swatch.text }}
                >
                  <span className="font-mono text-[11.5px] font-medium">
                    {swatch.hex}
                  </span>
                </div>
                <div className="p-3">
                  <p className="font-heading text-[13.5px] font-semibold">
                    {swatch.name}
                  </p>
                  <p className="text-[11.5px] text-[var(--text-secondary)]">
                    {swatch.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 2. Typography & Navigation */}
        <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Typography Scale</CardTitle>
                <CardDescription>
                  Plus Jakarta Sans headings, Inter body, tabular numerals.
                </CardDescription>
              </div>
            </CardHeader>
            <div className="space-y-4">
              <div className="border-b border-[var(--border-subtle)] pb-3">
                <span className="text-[11.5px] text-[var(--text-muted)]">
                  Display · 36px / 700
                </span>
                <p className="font-heading text-[28px] font-bold sm:text-[32px]">
                  Good morning, Maya
                </p>
              </div>
              <div className="border-b border-[var(--border-subtle)] pb-3">
                <span className="text-[11.5px] text-[var(--text-muted)]">
                  Heading · 20px / 600
                </span>
                <p className="font-heading text-[20px] font-semibold">
                  Weekly Household Rhythm
                </p>
              </div>
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-[11.5px] text-[var(--text-muted)]">
                    Body · 15px / 400
                  </span>
                  <p className="text-[15px] text-[var(--text-secondary)]">
                    Calm, readable copy for daily family notes.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11.5px] text-[var(--text-muted)]">
                    Tabular Currency
                  </span>
                  <p className="font-heading text-[22px] font-semibold tabular-nums">
                    $4,280.50
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Navigation & Tabs</CardTitle>
                  <CardDescription>
                    Pill navigation and segmented tab switchers.
                  </CardDescription>
                </div>
              </CardHeader>
              <div className="space-y-5">
                <NavigationPreview activeId={activeNav} onSelect={setActiveNav} />
                <Tabs
                  activeId={activeTab}
                  onChange={setActiveTab}
                  tabs={[
                    { id: "overview", label: "Overview" },
                    { id: "chores", label: "Chores", badge: 4 },
                    { id: "allowance", label: "Allowance" },
                  ]}
                />
              </div>
            </Card>
          </div>
        </section>

        {/* 3. Interactive Controls, Buttons, Inputs, Date Picker, Dialogs */}
        <section className="grid gap-8 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Buttons, Badges & Overlays</CardTitle>
                <CardDescription>
                  Tactile press states, contextual badges, dialogs & bottom sheets.
                </CardDescription>
              </div>
              <Dropdown
                trigger={
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                }
                items={[
                  {
                    id: "edit",
                    label: "Edit household",
                    icon: <Edit3 className="h-4 w-4" />,
                    onSelect: () => toast.info("Edit household selected"),
                  },
                  {
                    id: "vault",
                    label: "Verify Vault MFA",
                    icon: <ShieldCheck className="h-4 w-4" />,
                    onSelect: () => toast.success("MFA verified"),
                  },
                  {
                    id: "remove",
                    label: "Leave family",
                    icon: <Trash2 className="h-4 w-4" />,
                    danger: true,
                    onSelect: () => toast.error("Action requires confirmation"),
                  },
                ]}
              />
            </CardHeader>

            <div className="space-y-6">
              <div className="flex flex-wrap gap-2.5">
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Open Dialog
                </Button>
                <Button variant="secondary" onClick={() => setSheetOpen(true)}>
                  Bottom Sheet
                </Button>
                <Button
                  variant="tonal"
                  isLoading={isLoadingBtn}
                  onClick={triggerLoading}
                >
                  Save Changes
                </Button>
                <Button variant="ghost">Cancel</Button>
                <Button variant="danger" size="sm">
                  SOS Alert
                </Button>
                <Button disabled size="sm">
                  Disabled
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="forest">Owner</Badge>
                <Badge variant="sage">
                  <Check className="h-3 w-3" /> Synced
                </Badge>
                <Badge variant="peach">120 pts</Badge>
                <Badge variant="lavender">AI Draft</Badge>
                <Badge variant="blush">Expiring Soon</Badge>
                <Badge variant="danger">Overdue</Badge>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <Avatar name="Maya Rivera" size="xl" tone="forest" status="online" />
                <Avatar name="Daniel Rivera" size="lg" tone="peach" status="away" />
                <Avatar name="Leo Rivera" size="md" tone="lavender" />
                <Avatar name="Nora Rivera" size="sm" tone="blush" />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Form Controls & Date Picker</CardTitle>
                <CardDescription>
                  Soft tonal inputs, clear validation, and warm calendar popover.
                </CardDescription>
              </div>
            </CardHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Search family items"
                placeholder="Milk, passports, dentist..."
                leadingIcon={<Search className="h-4 w-4" />}
              />
              <Select
                label="Assign to member"
                options={[
                  { value: "maya", label: "Maya (Owner)" },
                  { value: "daniel", label: "Daniel (Admin)" },
                  { value: "leo", label: "Leo (Child)" },
                ]}
              />
              <Input
                label="Monthly grocery cap"
                defaultValue="850.00"
                className="tabular-nums"
                hint="Stored in integer cents on server"
              />
              <DatePicker
                label="Target date"
                value={selectedDate}
                onChange={setSelectedDate}
              />
              <div className="sm:col-span-2">
                <Input
                  label="PIN Verification"
                  defaultValue="12"
                  error="Child PIN must be 4 digits."
                />
              </div>
            </div>
          </Card>
        </section>

        {/* 4. Fintech Visualization & Ledger Table */}
        <section className="grid gap-8 lg:grid-cols-[1fr_1.35fr]">
          <Card className="flex flex-col justify-between gap-6">
            <CardHeader className="mb-0">
              <div>
                <CardTitle>Family Finance Pulse</CardTitle>
                <CardDescription>
                  Clean fintech-inspired charts with tabular alignment.
                </CardDescription>
              </div>
            </CardHeader>
            <BudgetRing
              spentCents={241000}
              budgetCents={320000}
              label="November Household Budget"
            />
            <SpendBarChart data={MONTHLY_SPEND} />
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-[20px] font-semibold">
                Recent Family Ledger
              </h2>
              <Badge variant="neutral">Tabular Numerals</Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {LEDGER_ROWS.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="font-medium text-[var(--text-primary)]">
                        {row.merchant}
                      </p>
                      <p className="text-[12px] text-[var(--text-muted)]">
                        {row.date}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.tone}>{row.category}</Badge>
                    </TableCell>
                    <TableCell className="text-[var(--text-secondary)]">
                      {row.member}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        row.amountCents > 0
                          ? "text-[var(--accent-primary)]"
                          : "text-[var(--text-primary)]"
                      }`}
                    >
                      {row.amountCents > 0 ? "+" : ""}
                      {formatCurrency(row.amountCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* 5. Feedback States: Skeletons, Empty, Error */}
        <section className="space-y-6">
          <h2 className="font-heading text-[22px] font-semibold">
            Loading, Empty & Error States
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Skeleton Placeholders</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            </Card>

            <EmptyState
              icon={<CalendarDays className="h-5 w-5" />}
              title="No events scheduled for Sunday"
              description="Keep the weekend open for rest, or add a family dinner to sync across everyone's calendar."
              actionLabel="Add Family Event"
              onAction={() => setDialogOpen(true)}
            />
          </div>

          <ErrorState
            onRetry={() => toast.info("Retrying connection...")}
          />
        </section>
      </main>

      {/* Dialog Demo */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Schedule Family Event"
        description="Visible to all active members of The Rivera Family."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setDialogOpen(false);
                toast.success("Event added to family calendar");
              }}
            >
              Save Event
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Event title"
            placeholder="Sunday Botanical Garden Walk"
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="demo-event-notes" className="text-[13.5px] font-medium">
              Event notes
            </label>
            <textarea
              id="demo-event-notes"
              rows={2}
              value={eventNotes}
              onChange={(e) => setEventNotes(e.target.value)}
              placeholder="Optional notes"
              className="w-full rounded-xl bg-[var(--bg-subtle)] p-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15"
            />
          </div>
          <DatePicker
            label="Date"
            value={selectedDate}
            onChange={setSelectedDate}
          />
        </div>
      </Dialog>

      {/* Bottom Sheet Demo */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Quick Add to Shopping"
      >
        <div className="space-y-4">
          <Input
            label="Item name"
            placeholder="Organic oat milk"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="demo-item-notes" className="text-[13.5px] font-medium">
              Shopping notes
            </label>
            <textarea
              id="demo-item-notes"
              rows={2}
              value={itemNotes}
              onChange={(e) => setItemNotes(e.target.value)}
              placeholder="Brand or quantity"
              className="w-full rounded-xl bg-[var(--bg-subtle)] p-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15"
            />
          </div>
          <Select
            label="Aisle"
            options={[
              { value: "dairy", label: "Dairy & Alternatives" },
              { value: "produce", label: "Fresh Produce" },
              { value: "pantry", label: "Pantry" },
            ]}
          />
          <Button
            className="w-full"
            onClick={() => {
              setSheetOpen(false);
              toast.success("Added to shared shopping list");
            }}
          >
            Add Item
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
