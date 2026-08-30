import { defineConfig } from "vitest/config";

/**
 * P5 includes a real local video render. Keep the suite deterministic on
 * developer machines by avoiding CPU contention with fixture ffmpeg commands.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
