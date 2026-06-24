import type { Metadata } from "next";
import { Geist, Geist_Mono, Spectral } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import NavLinks from "@/components/NavLinks";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Mise",
  description: "Your pantry-aware sous-chef",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spectral.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col overflow-hidden bg-paper text-ink">
        <nav className="sticky top-0 z-10 flex items-center justify-between border-b border-sand bg-surface px-6 py-3">
          <Link
            href="/"
            className="font-serif text-xl font-semibold tracking-tight text-ink hover:text-ember transition-colors"
          >
            Mise
          </Link>
          <NavLinks />
        </nav>
        {children}
      </body>
    </html>
  );
}
