import type { Config } from "tailwindcss";

/**
 * Paleta del shader del landing (GrainGradient con shape "corners").
 * Mantener estos tokens cuando se agreguen flujos para preservar
 * coherencia visual entre landing, auth, dashboard y resultados.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(0 0% 0%)",
        foreground: "hsl(0 0% 98%)",
        muted: {
          DEFAULT: "hsl(0 0% 50%)",
          foreground: "hsl(0 0% 65%)",
        },
        border: "hsl(0 0% 15%)",
        accent: {
          orange: "hsl(14 100% 57%)",
          yellow: "hsl(45 100% 51%)",
          pink: "hsl(340 82% 52%)",
        },
        // Estados semánticos para flujos de submission/evaluador
        status: {
          accepted: "hsl(142 71% 45%)",
          wrong: "hsl(340 82% 52%)",
          warning: "hsl(45 100% 51%)",
          critical: "hsl(14 100% 57%)",
          timeout: "hsl(280 70% 60%)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
