/**
 * Round-trip every official compliance case and sample file: parse → serialize must give the
 * same elements, text, attributes and nils in the same (schema) order, reparse to the same
 * document, and produce exactly the same XSD outcome as the original file.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { schemas } from "../../src/generated/index.ts";
import { SUPPORTED_VERSIONS } from "../../src/index.ts";
import { loadSchemaFiles } from "../../src/node.ts";
import { createXsdValidator, type XsdResult } from "../../src/validate/xsd.ts";
import { parseDocument } from "../../src/xml/parse.ts";
import { serializeDocument } from "../../src/xml/serialize.ts";
import { flattenXml } from "../support/flatten.ts";
import { specRoot } from "../support/spec.ts";

const xmlFiles = (dir: string, label: string) =>
	readdirSync(dir)
		.filter((f) => f.endsWith(".xml"))
		.sort()
		.map((f) => [`${label}/${f}`, join(dir, f)] as const);

/** XSD outcome without line numbers, which naturally differ after re-indenting. */
const outcome = (r: XsdResult) => ({
	valid: r.valid,
	errors: r.errors.map(({ element, message }) => ({ element, message })),
});

for (const version of SUPPORTED_VERSIONS) {
	const root = specRoot(version);
	describe.skipIf(!root)(`round-trip (${version})`, () => {
		const base = root ?? "";
		const schema = schemas[version];
		const validator = root
			? createXsdValidator(loadSchemaFiles(join(base, "XSDs", "NEMSIS_XSDs")))
			: undefined;
		const compliance = join(base, "Compliance", "Pre-Testing", "xml");
		const cases = [
			...["full", "national", "fail"].flatMap((d) =>
				xmlFiles(join(compliance, d), d),
			),
			...["EMS", "DEM", "State"].flatMap((d) =>
				xmlFiles(join(base, "SampleData", d, "xml"), d),
			),
		].filter(([name]) => !name.includes("FailXsd"));

		it("covers every file except the two FailXsd cases", () => {
			expect(cases).toHaveLength(125);
		});

		it.each(cases)("%s", async (_name, path) => {
			const xml = readFileSync(path, "utf8");
			const first = parseDocument(xml, schema);
			const out = serializeDocument(first.dataset, first.document, schema, {
				...(first.schemaLocation === undefined
					? {}
					: { schemaLocation: first.schemaLocation }),
			});

			// Same content, in the same order (the originals are already in schema order).
			expect(flattenXml(out)).toEqual(flattenXml(xml));

			const second = parseDocument(out, schema);
			expect(second.document).toEqual(first.document);
			expect(second.schemaLocation).toBe(first.schemaLocation);
			expect(second.issues.map((i) => [i.code, i.path])).toEqual(
				first.issues.map((i) => [i.code, i.path]),
			);

			const v = validator ?? createXsdValidator([]);
			expect(outcome(await v.validate(out))).toEqual(
				outcome(await v.validate(xml)),
			);
		});
	});
}
