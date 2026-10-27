import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        shell: "#151717",
        workspace: "#1B1D1C",
        panel: "#202321",
        emerald: "#37BD89",
      },
    },
  },
  plugins: [],
} satisfies Config;
