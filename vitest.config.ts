import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		// Browser smoke tests run separately: `pnpm test:browser` (vitest.browser.config.ts).
		exclude: [...configDefaults.exclude, "test/browser/**"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts", "scripts/**/*.ts"],
			exclude: [
				// Generated data (verified by the golden tests and the CI drift check, not by coverage).
				"src/generated/**",
				// Thin CLI entry points; their logic lives in scripts/lib and scripts/codegen, and CI
				// runs each of them end to end (spec:fetch, codegen:check, check:bundle, spec-watch).
				"scripts/codegen.ts",
				"scripts/fetch-spec.ts",
				"scripts/spec-watch.ts",
				"scripts/check-bundle.ts",
				"scripts/schematron-compile.ts",
			],
			reporter: ["text", "lcov", "json-summary"],
			// Current: ~99% statements/lines/functions, ~89% branches. Thresholds leave a little
			// headroom for refactors; raise them as coverage grows.
			thresholds: {
				statements: 95,
				lines: 95,
				functions: 95,
				branches: 85,
			},
		},
	},
});
