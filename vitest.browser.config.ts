import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/** Browser smoke tests: `pnpm test:browser` (needs `pnpm exec playwright install chromium`). */
export default defineConfig({
	// In CI the NEMSIS fixtures must be present, so their tests cannot be silently skipped.
	define: { __REQUIRE_SPEC__: JSON.stringify(Boolean(process.env.CI)) },
	test: {
		include: ["test/browser/**/*.browser.test.ts"],
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: "chromium" }],
		},
	},
});
