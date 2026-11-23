import { z } from "zod";

export const calendarEventInputSchema = z
  .object({
    familyId: z.string().uuid(),
    eventId: z.string().uuid().optional(),
    title: z.string().trim().min(1, "Event title is required.").max(140),
    description: z.string().trim().max(2000).default(""),
    location: z.string().trim().max(160).default(""),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    allDay: z.boolean().default(false),
    eventTimezone: z.string().trim().min(1).default("UTC"),
    visibility: z.enum(["family", "adults_only", "private"]).default("family"),
    category: z.string().trim().min(1).max(40).default("family"),
    colorToken: z
      .enum(["forest", "sage", "peach", "lavender", "blush"])
      .default("forest"),
    recurrenceRule: z
      .enum(["daily", "weekly", "monthly", "yearly"])
      .nullable()
      .default(null),
    recurrenceUntil: z.string().datetime({ offset: true }).nullable().default(null),
    reminderMinutes: z.number().int().min(0).max(10080).nullable().default(null),
    participantMemberIds: z.array(z.string().uuid()).default([]),
  })
  .refine((d) => new Date(d.endAt) >= new Date(d.startAt), {
    message: "End time must be after start time.",
    path: ["endAt"],
  });

export const rsvpSchema = z.object({
  familyId: z.string().uuid(),
  eventId: z.string().uuid(),
  rsvpStatus: z.enum(["accepted", "declined", "pending"]),
});

export type CalendarEventInput = z.infer<typeof calendarEventInputSchema>;
export type RsvpInput = z.infer<typeof rsvpSchema>;
