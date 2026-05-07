import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    template: "%s | Saha",
    default: "Saha – Book Racket Sports Courts in the UAE",
  },
  description:
    "Discover and book Padel, Tennis, Squash, and Badminton courts in Dubai and Abu Dhabi. Find facilities, check availability, and play today.",
  keywords: ["padel", "tennis", "squash", "badminton", "court booking", "Dubai", "Abu Dhabi", "UAE", "racket sports"],
  authors: [{ name: "Saha Platform" }],
  openGraph: {
    siteName: "Saha",
    type: "website",
    locale: "en_US",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning>
      <body suppressHydrationWarning className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
