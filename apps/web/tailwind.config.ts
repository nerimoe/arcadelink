import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201f",
        panel: "#f7f6f2",
        mint: "#107c72",
        coral: "#d94f45",
      },
      boxShadow: {
        soft: "0 18px 60px rgba(23, 32, 31, 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
