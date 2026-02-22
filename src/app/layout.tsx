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
    "Find sports facilities near you in Stuttgart and Baden-Württemberg. Search by sport, find student discounts, and connect with other players.",
  keywords: ["sports", "facility", "Stuttgart", "students", "discount", "Sportstätte"],
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
