import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Spectral } from "next/font/google";
import "./globals.css";
import AuthListener from "@/components/AuthListener";
import NavBar from "@/components/NavBar";
import { THEME_COLORS } from "@/lib/theme";

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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )theme-mode=([^;]+)/);var mode=m?decodeURIComponent(m[1]):(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(mode==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${spectral.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex h-dvh flex-col overflow-hidden bg-surface-base text-text-primary">
        <AuthListener />
        <NavBar />
        {children}
      </body>
    </html>
  );
}
