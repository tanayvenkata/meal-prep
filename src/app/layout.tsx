import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono, Spectral } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import { isThemeMode, themeColorEntries, type ThemeMode } from "@/lib/theme";

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

// A function (not a static object) because the resolved color depends on
// the theme-mode cookie — matching RootLayout avoids a browser-chrome flash.
export async function generateViewport(): Promise<Viewport> {
  const cookieStore = await cookies();
  const rawMode = cookieStore.get("theme-mode")?.value;
  const themeMode: ThemeMode = isThemeMode(rawMode) ? rawMode : "light";
  return { themeColor: themeColorEntries(themeMode) };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const rawMode = cookieStore.get("theme-mode")?.value;
  const themeMode: ThemeMode = isThemeMode(rawMode) ? rawMode : "light";

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spectral.variable} h-full antialiased ${themeMode === "dark" ? "dark" : ""}`}
    >
      <body className="flex h-full flex-col overflow-hidden bg-surface-base text-text-primary">
        <NavBar initialThemeMode={themeMode} />
        {children}
      </body>
    </html>
  );
}
