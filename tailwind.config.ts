import type { Config } from "tailwindcss";

/**
 * Brand tokens are driven by CSS variables (see globals.css) so the restaurant's
 * primary/secondary colors, set in admin Settings, can theme the whole app at
 * runtime without a rebuild. The values below are fallbacks used at build time.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "rgb(var(--brand-primary) / <alpha-value>)",
          secondary: "rgb(var(--brand-secondary) / <alpha-value>)",
          bg: "rgb(var(--brand-bg) / <alpha-value>)",
          surface: "rgb(var(--brand-surface) / <alpha-value>)",
          ink: "rgb(var(--brand-ink) / <alpha-value>)",
          muted: "rgb(var(--brand-muted) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.06)",
        lift: "0 10px 30px -10px rgb(0 0 0 / 0.25)",
      },
      keyframes: {
        "slide-up": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--brand-primary) / 0.5)" },
          "70%": { boxShadow: "0 0 0 10px rgb(var(--brand-primary) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--brand-primary) / 0)" },
        },
      },
      animation: {
        "slide-up": "slide-up 0.25s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "pulse-ring": "pulse-ring 1.8s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
