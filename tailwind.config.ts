import type { Config } from "tailwindcss";

/**
 * Design tokens lifted from `docs/03-ui/mockup.html` so the running
 * app reads as one product with the mockup, not two designs.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./types/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#ffffff",
        ink: "#0f172a",
        muted: "#64748b",
        line: "#e2e8f0",

        brand: {
          DEFAULT: "#2563eb",
          ink: "#1e40af",
          soft: "#eff6ff",
        },

        match: {
          DEFAULT: "#15803d",
          soft: "#f0fdf4",
          line: "#bbf7d0",
        },
        mismatch: {
          DEFAULT: "#b91c1c",
          soft: "#fef2f2",
          line: "#fecaca",
        },
        review: {
          DEFAULT: "#b45309",
          soft: "#fffbeb",
          line: "#fde68a",
        },
      },

      borderRadius: {
        panel: "14px",
      },

      boxShadow: {
        panel: "0 1px 2px rgba(15,23,42,.06), 0 8px 24px rgba(15,23,42,.06)",
        fab: "0 8px 24px rgba(37,99,235,.4)",
      },

      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },

      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #2563eb, #1e40af)",
      },
    },
  },
  plugins: [],
};

export default config;
