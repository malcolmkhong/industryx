import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    
    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // Accessibility (Phase 4.2) — icon-only buttons must have accessible names
    "jsx-a11y/control-has-associated-label": "warn",  // Phase 4.2: BUG-018 mostly resolved (game panels fixed); admin pages deferred to follow-up
    "jsx-a11y/anchor-has-content": "error",
    "jsx-a11y/click-events-have-key-events": "warn",
    "jsx-a11y/no-static-element-interactions": "warn",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
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
  ]
}];

export default eslintConfig;
