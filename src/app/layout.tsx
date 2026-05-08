import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import { getLocale } from "next-intl/server";
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
  authors: [{ name: "Saha Platform" }],
  openGraph: {
    siteName: "Saha",
    type: "website",
    locale: "en_US",
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

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <body suppressHydrationWarning className={`${cairo.className} antialiased`}>{children}</body>
    </html>
  );
}
