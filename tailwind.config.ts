import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        pp: {
          blue: "#003087",
          bright: "#009cde",
          navy: "#001c64",
        },
      },
    },
  },
  plugins: [],
};
export default config;
