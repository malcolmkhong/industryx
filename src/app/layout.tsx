import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider } from "@/components/providers/AuthProvider";
import { GameConfigProvider } from "@/components/providers/GameConfigProvider";
import DeferredAnalytics from "@/components/DeferredAnalytics";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IndustriaX — Factory Dominion: Automated Empire",
  description: "Build your industrial empire from scratch. Mine resources, build factories, research technologies, and dominate the galaxy.",
  keywords: ["IndustriaX", "Factory Dominion", "idle game", "incremental game", "factory game", "automation", "simulation"],
  authors: [{ name: "IndustriaX" }],
  icons: {
    icon: [
      { url: "/brand/favicon.ico", sizes: "any" },
      { url: "/brand/icon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "IndustriaX — Factory Dominion",
    description: "Build your industrial empire from scratch",
    type: "website",
  },
  // Add canonical URL for SEO
  alternates: {
    canonical: '/',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="canonical" href="https://industryx.vercel.app/" />
        <link rel="preconnect" href="https://wkkzqtseqwcyyyezroqq.supabase.co" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://vercel.com" crossOrigin="anonymous" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Suspense fallback={null}>
          <TooltipProvider>
          <AuthProvider>
            <GameConfigProvider>
              {children}
            </GameConfigProvider>
          </AuthProvider>
          </TooltipProvider>
        </Suspense>
        <DeferredAnalytics />
      </body>
    </html>
  );
}
