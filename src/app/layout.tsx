import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { siteConfig } from "@/config/site";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "@/lib/i18n";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: siteConfig.name,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2F6B4E" },
    { media: "(prefers-color-scheme: dark)", color: "#141A16" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialLocale = normalizeLocale(
    cookieStore.get(LOCALE_COOKIE_NAME)?.value
  );

  return (
    <html
      lang={initialLocale}
      suppressHydrationWarning
      className={`${inter.variable} ${jakarta.variable}`}
    >
      <body className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] selection:bg-[var(--tint-sage)] selection:text-[var(--tint-sage-fg)]">
        <AppProviders initialLocale={initialLocale}>{children}</AppProviders>
      </body>
    </html>
  );
}
