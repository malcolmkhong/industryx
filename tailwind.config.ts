import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // IndustryaX palette — registered as Tailwind utilities so
        // consumers can write `bg-industrial-card/80` instead of
        // `bg-[#111827]/80`. The hex values match globals.css
        // exactly so the rendered color is identical.
        // (Audit fix 2026-07-18: token wiring was previously missing,
        // forcing every consumer into arbitrary-value escape hatches.)
        "industrial-dark": "#0a0e17",
        "industrial-card": "#111827",
        "industrial-border": "#1e293b",
        "industrial-hover": "#1e3a5f",

        // Semantic tokens (R-A audit fix 2026-07-18):
        // These CSS variables are defined in globals.css but were
        // never wired into Tailwind. Consumers had to either
        // pass raw hex values (e.g. `color="#9ca3af"`) or use
        // `text-[#hex]` arbitrary-value escape hatches. The fix
        // registers them so consumers can use semantic utility
        // classes like `text-muted-label` and `text-warning`.
        //
        // Hex values match globals.css exactly.
        warning: "#facc15",
        danger: "#f87171",
        success: "#4ade80",
        brand: "#22d3ee",
        info: "#60a5fa",
        "muted-label": "#94a3b8",
        subtle: "#9ca3af",
        dim: "#9ca3af",

        // Icon-specific shades used by GameIcon consumers in the
        // auth/bootstrap screens. These were previously hardcoded
        // inline; registering them gives consumers a token.
        "warning-icon": "#fbbf24", // amber-400 (slightly darker than warning)
        "danger-subtle": "#fecaca", // red-200 (light red for disabled-state icon)
        "success-bright": "#34d399", // emerald-400 (fingerprint success icon)

        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
