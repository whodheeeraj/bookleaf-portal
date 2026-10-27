/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // BookLeaf brand: white page, coral accent, near-black surfaces.
        paper: "#F7F6F3",
        cream: "#FFFFFF",
        ink: "#171717",
        // The `forest` token name is kept for compatibility; the scale is the
        // BookLeaf coral/rose ramp, with 950 reserved for near-black surfaces.
        forest: {
          50: "#FFF1F3",
          100: "#FFE1E5",
          200: "#FFC7CE",
          300: "#FBA6B1",
          400: "#F57F8E",
          500: "#F26979",
          600: "#D13349",
          700: "#AE2A3E",
          800: "#8C2333",
          900: "#6B1D29",
          950: "#161616",
        },
        gold: {
          50: "#FBF5E8",
          100: "#F5E8CC",
          200: "#EBD09A",
          300: "#DFB264",
          400: "#D2963B",
          500: "#C4832A",
          600: "#A36722",
          700: "#824E1F",
          800: "#6C4020",
          900: "#5B371D",
        },
        clay: "#B4553E",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: ["Iowan Old Style", "Palatino Linotype", "Georgia", "ui-serif", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,23,23,0.04), 0 12px 30px -18px rgba(23,23,23,0.22)",
        lift: "0 24px 60px -30px rgba(23,23,23,0.45)",
      },
      animation: {
        "fade-in": "fadeIn 240ms ease-out both",
        "slide-up": "slideUp 260ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
