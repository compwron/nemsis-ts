/**
 * Parse every official compliance case and sample file, and check the typed document is a
 * lossless view of the XML: an independent parser (fast-xml-parser) must find exactly the same
 * elements, text, attributes and nils.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { schemas } from "../../src/generated/index.ts";
import { SUPPORTED_VERSIONS } from "../../src/index.ts";
import { parseDocument } from "../../src/xml/parse.ts";
import { byPath, flattenDocument, flattenXml } from "../support/flatten.ts";
import { specRoot } from "../support/spec.ts";

const xmlFiles = (dir: string, label: string) =>
	readdirSync(dir)
		.filter((f) => f.endsWith(".xml"))
		.sort()
		.map((f) => [`${label}/${f}`, join(dir, f)] as const);

for (const version of SUPPORTED_VERSIONS) {
	const root = specRoot(version);
	describe.skipIf(!root)(`parse (${version})`, () => {
		const base = root ?? "";
		const schema = schemas[version];
		const compliance = join(base, "Compliance", "Pre-Testing", "xml");
		const cases = [
			...["full", "national", "fail"].flatMap((d) =>
				xmlFiles(join(compliance, d), d),
			),
			...["EMS", "DEM", "State"].flatMap((d) =>
				xmlFiles(join(base, "SampleData", d, "xml"), d),
			),
		];

		it("covers 17 compliance cases and 110 sample files", () => {
			expect(cases).toHaveLength(127);
		});

		it.each(cases)("%s", (name, path) => {
			const xml = readFileSync(path, "utf8");
			const result = parseDocument(xml, schema);

			// Lossless: same elements, text, attributes and nils as an independent parser sees.
			const expected = flattenXml(xml).sort(byPath);
			const actual = flattenDocument(
				result.document,
				schema.datasets[result.dataset],
			).sort(byPath);

			if (name.includes("FailXsd")) {
				// Intentionally schema-invalid: anything the parser could not place must be explained
				// by an unknown-element / too-many issue, and nothing may be invented.
				// Attribute order differs (schema order vs document order), so compare it sorted.
				const key = (e: (typeof expected)[number]) =>
					JSON.stringify({ ...e, attrs: Object.entries(e.attrs).sort() });
				const seen = new Set(expected.map(key));
				expect(actual.filter((e) => !seen.has(key(e)))).toEqual([]);
				const kept = new Set(actual.map(key));
				const dropped = expected.filter((e) => !kept.has(key(e)));
				const unindex = (p: string) => p.replace(/\[\d+\]/g, "");
				const explained = result.issues
					.filter((i) => i.code === "unknown-element" || i.code === "too-many")
					.map((i) => unindex(i.path));
				for (const e of dropped) {
					expect(
						explained.some((p) => unindex(e.path).startsWith(p)),
						e.path,
					).toBe(true);
				}
				return;
			}
			expect(actual).toEqual(expected);
			if (name.startsWith("EMS/")) {
				// Known upstream defect (see docs/PLAN.md): EMS samples lack the mandatory ePatient.25.
				expect(result.issues.length).toBeGreaterThan(0);
				for (const issue of result.issues) {
					expect([
						issue.code,
						issue.path.replace(/.*\/ePatient\//, ""),
					]).toEqual(["missing-element", "ePatient.25"]);
				}
			} else {
				expect(result.issues).toEqual([]);
			}
		});
	});
}
