import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Cairo supports both Arabic and Latin scripts
const cairo = Cairo({ subsets: ["latin", "arabic"] });

export const metadata: Metadata = {
  title: {
    template: "%s | Saha",
    default: "Saha – Book Racket Sports Courts in the UAE",
  },
  description:
    "Discover and book Padel, Pickleball, Tennis, Squash, and Badminton courts in Dubai and Abu Dhabi. Find facilities, check availability, and play today.",
  keywords: ["padel", "pickleball", "tennis", "squash", "badminton", "court booking", "Dubai", "Abu Dhabi", "UAE", "racket sports"],
  authors: [{ name: "Saha" }],
  openGraph: {
    siteName: "Saha",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/saha-logo-512.png",
        width: 512,
        height: 512,
        alt: "Saha – Racket Sports Court Booking",
      },
    ],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let locale = "en";
  try {
    locale = await getLocale();
  } catch {
    locale = "en";
  }

  // SAH-122: only mount Vercel Analytics after the user accepts non-essential
  // cookies. <CookieBanner /> (mounted in the locale layout) writes the
  // `saha_cookie_consent` cookie and reloads, after which this branch flips
  // and Analytics renders for the rest of the session. Strictly-necessary
  // cookies (Supabase auth, facility-switcher) don't require consent.
  const cookieStore = await cookies();
  const analyticsConsent = cookieStore.get("saha_cookie_consent")?.value === "accepted";

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <body suppressHydrationWarning className={`${cairo.className} antialiased`}>
        {children}
        {analyticsConsent && <Analytics />}
      </body>
    </html>
  );
}
