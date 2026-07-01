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
// the theme-mode cookie — same data RootLayout below reads for the .dark
// class, so an explicit override is correct from the very first paint
// instead of only after ThemeToggle's client-side sync runs.
export async function generateViewport(): Promise<Viewport> {
  const cookieStore = await cookies();
  const rawMode = cookieStore.get("theme-mode")?.value;
  const themeMode: ThemeMode = isThemeMode(rawMode) ? rawMode : "system";
  return { themeColor: themeColorEntries(themeMode) };
}

// Only runs for the "system"/no-cookie case — an explicit theme-mode cookie
// is already rendered correctly server-side before any script runs, so this
// is just the OS-preference fallback, applied before first paint.
const NO_FOUC_SCRIPT = `(function(){try{if(matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.classList.add("dark")}}catch(e){}})()`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const rawMode = cookieStore.get("theme-mode")?.value;
  const themeMode: ThemeMode = isThemeMode(rawMode) ? rawMode : "system";

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spectral.variable} h-full antialiased ${themeMode === "dark" ? "dark" : ""}`}
      suppressHydrationWarning
    >
      <head>
        {themeMode === "system" && (
          <script dangerouslySetInnerHTML={{ __html: NO_FOUC_SCRIPT }} />
        )}
      </head>
      <body className="flex h-full flex-col overflow-hidden bg-surface-base text-text-primary">
        <NavBar initialThemeMode={themeMode} />
        {children}
      </body>
    </html>
  );
}
