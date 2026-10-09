import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        display: ["Outfit", "Avenir Next", "sans-serif"],
        body: ["Figtree", "Avenir Next", "sans-serif"],
      },

      /* ------------------------------------------------------------------
         Type scale. Previously there were 517 arbitrary text-[Npx] values
         and 83% of all text sat at 12-14px with no distinct body size and
         no hero tier — even though a 148px hero existed inside the share
         composer. These are the named steps; prefer them over brackets.
         `caption` (12px) is the floor for content.
         ------------------------------------------------------------------ */
      fontSize: {
        display: ["2.75rem", { lineHeight: "1.04", letterSpacing: "-0.03em" }],
        h1: ["2rem", { lineHeight: "1.12", letterSpacing: "-0.02em" }],
        h2: ["1.5rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        h3: ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.01em" }],
        body: ["1rem", { lineHeight: "1.6" }],
        label: ["0.8125rem", { lineHeight: "1.4" }],
        caption: ["0.75rem", { lineHeight: "1.4" }],
        /* numeral tiers — pair with `tnum` so columns align */
        "num-hero": ["2.5rem", { lineHeight: "1", letterSpacing: "-0.03em" }],
        "num-lg": ["1.75rem", { lineHeight: "1", letterSpacing: "-0.025em" }],
        "num-md": ["1.375rem", { lineHeight: "1", letterSpacing: "-0.02em" }],
        "num-sm": ["1.0625rem", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
      },

      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        /* inset / recessed surface */
        "surface-2": "hsl(var(--surface-2))",

        /* semantic status — now real tokens with foreground pairs */
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          foreground: "hsl(var(--gold-foreground))",
        },

        /* metric domains — were hex literals at every call site */
        hr: "hsl(var(--hr))",
        load: "hsl(var(--load))",
        elevation: "hsl(var(--elevation))",
        cadence: "hsl(var(--cadence))",
        pace: "hsl(var(--pace))",

        /* chart series ramp */
        "chart-1": "hsl(var(--chart-1))",
        "chart-2": "hsl(var(--chart-2))",
        "chart-3": "hsl(var(--chart-3))",
        "chart-4": "hsl(var(--chart-4))",
        "chart-5": "hsl(var(--chart-5))",

        /* HR / pace zone ramp */
        "zone-1": "hsl(var(--zone-1))",
        "zone-2": "hsl(var(--zone-2))",
        "zone-3": "hsl(var(--zone-3))",
        "zone-4": "hsl(var(--zone-4))",
        "zone-5": "hsl(var(--zone-5))",

        /* calendar heat ramp */
        "heat-1": "hsl(var(--heat-1))",
        "heat-2": "hsl(var(--heat-2))",
        "heat-3": "hsl(var(--heat-3))",
        "heat-4": "hsl(var(--heat-4))",

        /* rank tiers */
        "tier-bronze": "hsl(var(--tier-bronze))",
        "tier-silver": "hsl(var(--tier-silver))",
        "tier-gold": "hsl(var(--tier-gold))",
        "tier-diamond": "hsl(var(--tier-diamond))",

        "tab-active": "hsl(var(--tab-active))",
        "tab-inactive": "hsl(var(--tab-inactive))",
        "score-bg": "hsl(var(--score-bg))",
        "score-text": "hsl(var(--score-text))",
        "score-label": "hsl(var(--score-label))",

        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },

      /* ------------------------------------------------------------------
         Radius. Previously --radius fed only lg/md/sm while xl/2xl kept
         Tailwind's defaults, so shadcn's Card (rounded-lg) was SMALLER than
         the hand-rolled cards beside it (rounded-2xl). Now every step
         derives from the single --radius token.
         ------------------------------------------------------------------ */
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 2px)",
        "2xl": "calc(var(--radius) + 6px)",
      },

      /* ------------------------------------------------------------------
         Elevation. There was no shadow token at all; "this is a card" was
         expressed four incompatible ways (border / ring / border-40 /
         bespoke shadow-[...]) including a hue-175 teal matching no token.
         ------------------------------------------------------------------ */
      boxShadow: {
        card: "var(--shadow-card)",
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
      },

      spacing: {
        /* h-13 was used in Onboarding but no spacing step existed for it. */
        13: "3.25rem",
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "coach-bounce": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-0.8deg)" },
          "50%": { transform: "rotate(0.8deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 2s infinite",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "coach-bounce": "coach-bounce 2.6s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
