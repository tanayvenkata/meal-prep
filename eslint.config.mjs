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
    // Claude Code local tooling (worktrees, session state) — not our code
    ".claude/**",
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
        {
          // Accessibility gate: every form input must carry a programmatic
          // label so screen readers announce it — placeholder text alone is
          // NOT a label (it vanishes on typing, isn't reliably announced).
          // jsx-a11y (bundled with eslint-config-next) has no rule that flags
          // a bare <input>, so we assert it here in the same custom-selector
          // style as the color rules above: an <input> is only valid if it has
          // an aria-label, aria-labelledby, or an id (paired with a <label>).
          selector:
            "JSXOpeningElement[name.name='input']:not(:has(JSXAttribute[name.name=/^(aria-label|aria-labelledby|id)$/]))",
          message:
            "This <input> has no accessible label. Add aria-label (or aria-labelledby / an id tied to a <label>) — placeholder text is not a label.",
        },
      ],
    },
  },
]);

export default eslintConfig;
