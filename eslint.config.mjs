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
    // Vendored shadcn/ui components, ported as-is from v1 — not hand-edited to
    // satisfy stricter lint rules added since v1 generated them.
    "components/ui/**",
    "hooks/use-mobile.tsx",
  ]),
]);

export default eslintConfig;
