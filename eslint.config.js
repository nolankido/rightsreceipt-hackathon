import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      ".wrangler/**",
      ".data/**",
      "node_modules/**",
      "worker-configuration.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.worker,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs", "*.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // These Playwright diagnostics execute page.evaluate callbacks in the browser.
    files: ["scripts/**/*-browser-check.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    // These security validators intentionally match control characters to reject them.
    files: [
      "apps/api/src/transaction-routes.ts",
      "packages/application/src/clarification-workflow.ts",
      "packages/application/src/consent-integrity.ts",
      "packages/application/src/human-consent.ts",
      "packages/application/src/request-intake.ts",
      "packages/domain/src/buyer-requests.ts",
      "packages/paypal/src/adapter.ts",
      "packages/paypal/src/reconciliation.ts",
      "packages/paypal/src/sandbox-draft.ts",
      "packages/paypal/src/sandbox-invoice.ts",
      "packages/receipts/src/material.ts",
      "scripts/support/judge-rehearsal-runtime.mjs",
    ],
    rules: {
      "no-control-regex": "off",
    },
  },
);
