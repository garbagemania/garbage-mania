import type { Config } from "tailwindcss";
import { colors, typography, radii } from "./src/config/theme";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: colors.green,
          yellow: colors.yellow,
        },
        neutral: colors.neutral,
        success: colors.status.success,
        warning: colors.status.warning,
        danger: colors.status.danger,
        info: colors.status.info,
      },
      fontFamily: {
        sans: [...typography.fontFamily.sans],
        mono: [...typography.fontFamily.mono],
      },
      fontSize: typography.scale,
      borderRadius: radii,
    },
  },
  plugins: [],
};

export default config;
