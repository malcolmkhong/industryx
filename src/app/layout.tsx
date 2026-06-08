import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { IconPreloader } from "@/components/game/shared/IconPreloader";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { GameConfigProvider } from "@/components/providers/GameConfigProvider";

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
    icon: "/logo.svg",
  },
  openGraph: {
    title: "IndustriaX — Factory Dominion",
    description: "Build your industrial empire from scratch",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AuthProvider>
          <GameConfigProvider>
            <IconPreloader>
              {children}
            </IconPreloader>
          </GameConfigProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
