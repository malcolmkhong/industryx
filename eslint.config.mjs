import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // ─── TypeScript rules (strict, ON) ─────────────────────────────────
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-expect-error": "allow-with-description",
          "ts-nocheck": true,
          "ts-check": false,
        },
      ],
      "@typescript-eslint/prefer-as-const": "error",

      // Type safety (added — previously off entirely)
      // Note: type-aware rules (no-unsafe-*) require parserOptions.project
      // which is a heavier config — disabled here. Re-enable when adding
      // typed linting setup.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // ─── React rules (strict, ON) ──────────────────────────────────────
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/purity": "warn",
      "react/no-unescaped-entities": "error",
      "react/display-name": "warn",
      "react/prop-types": "off",
      "react/jsx-key": "error",
      "react/no-array-index-key": "warn",
      "react/self-closing-comp": "warn",

      // ─── Next.js rules (strict, ON) ────────────────────────────────────
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "error",

      // ─── Accessibility ─────────────────────────────────────────────────
      "jsx-a11y/control-has-associated-label": "warn",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",

      // ─── General JavaScript rules (strict, ON) ─────────────────────────
      "prefer-const": "error",
      "no-unused-vars": "off",
      "no-console": ["warn", { allow: ["warn", "error","info"] }],
      "no-debugger": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-irregular-whitespace": "error",
      "no-case-declarations": "error",
      "no-fallthrough": "error",
      "no-mixed-spaces-and-tabs": "error",
      "no-redeclare": "error",
      "no-undef": "off",
      "no-unreachable": "error",
      "no-useless-escape": "warn",

      // Added general rules
      "no-var": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-arrow-callback": "warn",
      "object-shorthand": ["warn", "always"],
      "no-else-return": "warn",
      "no-lonely-if": "warn",
      "no-unneeded-ternary": "warn",
      "no-nested-ternary": "warn",
      yoda: "error",
      "no-throw-literal": "error",
      "no-return-await": "warn",
      "no-async-promise-executor": "warn",
      "require-await": "warn",
      "no-await-in-loop": "warn",
      "no-duplicate-imports": "error",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "html/**",
      "build/**",
      "next-env.d.ts",
      "examples/**",
      "skills/**",
      ".history/**",
      "tests/**",
      "chroma/**",
      "cloudflare/**",
      "planning/**",
      "scripts/**",
      "public/**",
      "dev-server.err",
      "lint-output.txt",
      "build-output.txt",
      "convert_to_svg.py",
      "convert_to_svg_color.py",
    ],
  },
];

export default eslintConfig;
