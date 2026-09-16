import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Node, not jsdom: unlike pulse-astro this module emits element
    // DESCRIPTORS and never executes anything in a browser. What those
    // descriptors become as bytes is proved by `scripts/verify-build.mjs`,
    // which renders a real Nuxt site — the unit tests cannot and must not
    // pretend to answer that.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
