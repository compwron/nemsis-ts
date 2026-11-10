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
	it("has subpath exports per supported version (+ /xsd) plus validate, schematron and node", () => {
		const subpaths = Object.keys(pkg.exports).filter((k) => k !== ".");
		expect(subpaths.sort()).toEqual(
			[
				...SUPPORTED_VERSIONS.flatMap((v) => [
					`./${short(v)}`,
					`./${short(v)}/xsd`,
				]),
				"./node",
				"./schematron",
				"./validate",
			].sort(),
		);
		for (const s of [
			...SUPPORTED_VERSIONS.map(short),
			"node",
			"schematron",
			"validate",
		]) {
			expect(pkg.exports[`./${s}`]).toEqual({
				types: `./dist/${s}.d.ts`,
				import: `./dist/${s}.js`,
			});
		}
	});

	it("exposes the validators and Node helpers on their own subpaths", async () => {
		const validate = await import("../src/validate.ts");
		const schematron = await import("../src/schematron.ts");
		const node = await import("../src/node.ts");
		expect(Object.keys(validate).sort()).toEqual(["createXsdValidator"]);
		expect(Object.keys(schematron).sort()).toEqual([
			"SCHEMATRON_PATCHES",
			"createSchematronValidator",
			"parseSvrl",
		]);
		expect(Object.keys(node).sort()).toEqual([
			"compileSchematron",
			"loadSchemaFiles",
		]);
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
		"nemsis-ts/%s exports that version's schema, parse and serialize",
		async (s, v) => {
			const mod = (await import(`../src/${s}.ts`)) as Record<
				string,
				unknown
			> & {
				schema: { version: string };
			};
			expect(Object.keys(mod).sort()).toEqual([
				"NemsisParseError",
				"NemsisSerializeError",
				"parse",
				"schema",
				"serialize",
			]);
			expect(mod.schema.version).toBe(v);
		},
	);
});

describe("optional bundled XSDs", () => {
	it.each(SUPPORTED_VERSIONS.map(short))(
		"nemsis-ts/%s/xsd is declared and a stub in source",
		async (s) => {
			expect(pkg.exports[`./${s}/xsd`]).toEqual({
				types: `./dist/${s}/xsd.d.ts`,
				import: `./dist/${s}/xsd.js`,
			});
			const mod = (await import(
				`../src/xsd/v${s.replaceAll(".", "_")}.ts`
			)) as {
				bundled: boolean;
				schemaFiles: unknown[];
			};
			expect(mod.bundled).toBe(false);
			expect(mod.schemaFiles).toEqual([]);
		},
	);
});
