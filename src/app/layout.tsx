import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    template: "%s | Saha",
    default: "Saha – Sports Facility Directory",
  },
  description:
    "Find racquet sports facilities in Egypt, Malaysia, Qatar, and the United Arab Emirates. Focused on padel, badminton, squash, and tennis.",
  keywords: ["padel", "badminton", "squash", "tennis", "facility", "Egypt", "Malaysia", "Qatar", "United Arab Emirates"],
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
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
