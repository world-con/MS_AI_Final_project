import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests focus on the "hard parts" of this project:
// - payload normalization (multiple provider shapes -> one EventItem)
// - coordinate mapping (percent/world/bbox -> normalized 0..1)
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

