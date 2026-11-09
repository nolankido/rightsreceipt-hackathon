import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const packageAliases = {
  "@rightsreceipt/contracts": fileURLToPath(
    new URL("./packages/contracts/src/index.ts", import.meta.url),
  ),
  "@rightsreceipt/domain": fileURLToPath(
    new URL("./packages/domain/src/index.ts", import.meta.url),
  ),
  "@rightsreceipt/application": fileURLToPath(
    new URL("./packages/application/src/index.ts", import.meta.url),
  ),
  "@rightsreceipt/persistence": fileURLToPath(
    new URL("./packages/persistence/src/index.ts", import.meta.url),
  ),
  "@rightsreceipt/pricing": fileURLToPath(
    new URL("./packages/pricing/src/index.ts", import.meta.url),
  ),
  "@rightsreceipt/ai-runtime": fileURLToPath(
    new URL("./packages/ai-runtime/src/index.ts", import.meta.url),
  ),
  "@rightsreceipt/paypal": fileURLToPath(
    new URL("./packages/paypal/src/index.ts", import.meta.url),
  ),
  "@rightsreceipt/receipts": fileURLToPath(
    new URL("./packages/receipts/src/index.ts", import.meta.url),
  ),
  "@rightsreceipt/observability": fileURLToPath(
    new URL("./packages/observability/src/index.ts", import.meta.url),
  ),
  "@rightsreceipt/testing": fileURLToPath(
    new URL("./packages/testing/src/index.ts", import.meta.url),
  ),
  "@rightsreceipt/ui": fileURLToPath(
    new URL("./packages/ui/src/index.tsx", import.meta.url),
  ),
};

export default defineConfig({
  resolve: {
    alias: packageAliases,
  },
  test: {
    environment: "node",
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    reporters: ["default"],
    passWithNoTests: false,
  },
});
