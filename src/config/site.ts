export const siteConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "Senvamily",
  tagline: "Your Family, Your World.",
  description:
    "Senvamily is your connected family space to organize everyday life, manage family activities, and grow together.",
  shortDescription:
    "A connected space to organize, manage, and grow together as a family.",
  emailSenderName: process.env.EMAIL_SENDER_NAME || "Senvamily",
} as const;
