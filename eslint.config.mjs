import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // Global ignores should come first.
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

  // Next.js, React, React Hooks and TypeScript base rules.
  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    rules: {
      // ================================================================
      // TypeScript: correctness and unsafe shortcuts
      // ================================================================

      "@typescript-eslint/no-explicit-any": "error",

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
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
          minimumDescriptionLength: 10,
        },
      ],

      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/prefer-as-const": "error",

      // Mostly consistency/readability, not production correctness.
      "@typescript-eslint/no-inferrable-types": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],

      // These require typed linting. Do not enable until projectService
      // or another typed-linting configuration is added.
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",

      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",

      // Disable base rule because TypeScript version handles TS correctly.
      "no-unused-vars": "off",

      // ================================================================
      // React: rules that can cause runtime/UI bugs
      // ================================================================

      // Missing dependencies can produce stale values and incorrect effects.
      "react-hooks/exhaustive-deps": "error",

      // Detect impure rendering logic.
      "react-hooks/purity": "error",

      "react/jsx-key": "error",

      // Can cause incorrect component reuse, but index keys are sometimes valid.
      "react/no-array-index-key": "warn",

      // Development/debugging concern, not normally a runtime failure.
      "react/display-name": "warn",

      "react/prop-types": "off",

      // Style/content rules.
      "react/no-unescaped-entities": "warn",
      "react/self-closing-comp": "warn",

      // ================================================================
      // Next.js: routing and production behavior
      // ================================================================

      "@next/next/no-html-link-for-pages": "error",

      // Image optimization affects production performance, but <img> can
      // sometimes be intentional.
      "@next/next/no-img-element": "warn",

      // ================================================================
      // Accessibility: user-facing production requirements
      // ================================================================

      "jsx-a11y/control-has-associated-label": "error",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/label-has-associated-control": "error",

      // ================================================================
      // JavaScript: definite or likely production bugs
      // ================================================================

      "array-callback-return": "error",
      "consistent-return": "error",

      "constructor-super": "error",
      "for-direction": "error",
      "getter-return": "error",

      "no-async-promise-executor": "error",
      "no-case-declarations": "error",
      "no-class-assign": "error",
      "no-compare-neg-zero": "error",
      "no-cond-assign": ["error", "except-parens"],
      "no-const-assign": "error",
      "no-constant-binary-expression": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-constructor-return": "error",
      "no-control-regex": "error",
      "no-debugger": "error",
      "no-dupe-args": "error",
      "no-dupe-class-members": "error",
      "no-dupe-else-if": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-duplicate-imports": "error",

      "no-empty": [
        "error",
        {
          allowEmptyCatch: false,
        },
      ],

      "no-empty-character-class": "error",
      "no-ex-assign": "error",
      "no-extra-boolean-cast": "error",
      "no-fallthrough": "error",
      "no-func-assign": "error",
      "no-import-assign": "error",
      "no-invalid-regexp": "error",
      "no-irregular-whitespace": "error",
      "no-loss-of-precision": "error",
      "no-new-native-nonconstructor": "error",
      "no-new-wrappers": "error",
      "no-obj-calls": "error",
      "no-promise-executor-return": "error",
      "no-prototype-builtins": "error",
      "no-redeclare": "error",
      "no-self-assign": "error",
      "no-self-compare": "error",
      "no-setter-return": "error",
      "no-shadow-restricted-names": "error",
      "no-sparse-arrays": "error",
      "no-template-curly-in-string": "error",
      "no-this-before-super": "error",
      "no-throw-literal": "error",
      "no-unassigned-vars": "error",
      "no-undef-init": "error",
      "no-unexpected-multiline": "error",
      "no-unmodified-loop-condition": "error",
      "no-unreachable": "error",
      "no-unreachable-loop": "error",
      "no-unsafe-finally": "error",
      "no-unsafe-negation": "error",
      "no-unsafe-optional-chaining": "error",
      "no-useless-assignment": "error",
      "no-useless-backreference": "error",
      "require-yield": "error",
      "use-isnan": "error",
      "valid-typeof": "error",

      // Important correctness conventions.
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "prefer-promise-reject-errors": "error",
      "no-var": "error",

      // TypeScript handles undefined symbols.
      "no-undef": "off",

      // ================================================================
      // Potential performance or concurrency issues
      // ================================================================

      // Sequential awaits may be intentional for DB transactions,
      // rate limits or ordered game calculations.
      "no-await-in-loop": "warn",

      // Can identify stale read/write races but may produce false positives.
      "require-atomic-updates": "warn",

      // An async function without await is not necessarily incorrect.
      "require-await": "warn",

      // ================================================================
      // Logging
      // ================================================================

      "no-console": [
        "warn",
        {
          allow: ["warn", "error", "info"],
        },
      ],

      // ================================================================
      // Maintainability/style only
      // ================================================================

      "no-mixed-spaces-and-tabs": "error",
      "no-useless-escape": "warn",

      "prefer-arrow-callback": "warn",
      "object-shorthand": ["warn", "always"],
      "no-else-return": "warn",
      "no-lonely-if": "warn",
      "no-unneeded-ternary": "warn",

      // Pure style; nested ternaries do not automatically mean broken code.
      "no-nested-ternary": "off",

      yoda: "error",
    },
  },
];

export default eslintConfig;
