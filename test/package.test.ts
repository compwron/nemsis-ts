/**
 * Package shape: the root entry is small (helpers + types only); each NEMSIS version's schema
 * data lives behind its own subpath export (`nemsis-ts/3.5.1`) so apps load only what they use.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as root from "../src/index.ts";
import { SUPPORTED_VERSIONS } from "../src/index.ts";

const pkg = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
	exports: Record<string, { types: string; import: string }>;
};

const short = (v: string) => v.split(".").slice(0, 3).join(".");

describe("package exports", () => {
	it("has a subpath export for every supported version", () => {
		const subpaths = Object.keys(pkg.exports).filter(
			(k) => k !== "." && k !== "./package.json",
		);
		expect(subpaths.sort()).toEqual(
			SUPPORTED_VERSIONS.map((v) => `./${short(v)}`).sort(),
		);
		for (const v of SUPPORTED_VERSIONS) {
			expect(pkg.exports[`./${short(v)}`]).toEqual({
				types: `./dist/${short(v)}.d.ts`,
				import: `./dist/${short(v)}.js`,
			});
		}
	});

	it("keeps schema data out of the root entry", () => {
		expect(Object.keys(root).sort()).toEqual([
			"SUPPORTED_VERSIONS",
			"effectiveFacets",
			"leaves",
			"walk",
		]);
	});

	it.each(SUPPORTED_VERSIONS.map((v) => [short(v), v]))(
		"nemsis-ts/%s exports that version's schema",
		async (s, v) => {
			const mod = (await import(`../src/${s}.ts`)) as {
				schema: { version: string };
			};
			expect(mod.schema.version).toBe(v);
		},
	);
});
