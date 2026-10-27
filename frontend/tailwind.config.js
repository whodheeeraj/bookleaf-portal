/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F3EB",
        cream: "#FBF9F4",
        ink: "#16211B",
        forest: {
          50: "#EEF5F0",
          100: "#D8E9DE",
          200: "#B3D4C0",
          300: "#85B89B",
          400: "#569876",
          500: "#387C5C",
          600: "#296349",
          700: "#21503C",
          800: "#1B4031",
          900: "#163429",
          950: "#0B211A",
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
        card: "0 1px 2px rgba(22,33,27,0.04), 0 12px 30px -18px rgba(22,33,27,0.22)",
        lift: "0 24px 60px -30px rgba(11,33,26,0.45)",
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
