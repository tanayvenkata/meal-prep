import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Design runtime — third-party file, not our code
    "design_handoff/**",
  ]),
  {
    files: ["src/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Colors must flow through the design tokens in globals.css, not get
    // hand-typed per component — otherwise dark mode (or any future theme)
    // can't repaint them by redefining the tokens under `.dark`.
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXAttribute[name.name='style'] Literal[value=/#[0-9a-fA-F]{3,8}|rgba?\\(/]",
          message:
            "Hardcoded color in a style prop bypasses the design-token system. Reference a CSS custom property (e.g. var(--shadow-color-sm)) or an existing token class instead — see globals.css.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] :matches(Literal[value=/-\\[#[0-9a-fA-F]{3,8}\\]|-\\[rgba?\\(/], TemplateElement[value.raw=/-\\[#[0-9a-fA-F]{3,8}\\]|-\\[rgba?\\(/])",
          message:
            "Arbitrary Tailwind color value bypasses the design-token system. Use an existing token utility (bg-paper, text-ink, etc.) or add a new token in globals.css.",
        },
      ],
    },
  },
]);

export default eslintConfig;
