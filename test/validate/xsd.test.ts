import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSchemaFiles } from "../../src/node.ts";
import { createXsdValidator, type SchemaFile } from "../../src/validate/xsd.ts";

const NS = `xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns="http://www.nemsis.org" targetNamespace="http://www.nemsis.org" elementFormDefault="qualified"`;

/** A miniature "NEMSIS" schema: EMSDataSet_v3.xsd includes commonTypes_v3.xsd. */
const schemaFiles: SchemaFile[] = [
	{
		fileName: "commonTypes_v3.xsd",
		contents: `<xs:schema ${NS}><xs:simpleType name="SBP"><xs:restriction base="xs:integer"><xs:minInclusive value="0"/><xs:maxInclusive value="500"/></xs:restriction></xs:simpleType></xs:schema>`,
	},
	{
		fileName: "EMSDataSet_v3.xsd",
		contents: `<xs:schema ${NS}><xs:include schemaLocation="commonTypes_v3.xsd"/>
			<xs:element name="EMSDataSet"><xs:complexType><xs:sequence>
				<xs:element name="eVitals.06" type="SBP"/>
			</xs:sequence></xs:complexType></xs:element></xs:schema>`,
	},
];

const doc = (body: string) =>
	`<?xml version="1.0" encoding="UTF-8"?>\n<EMSDataSet xmlns="http://www.nemsis.org">\n${body}\n</EMSDataSet>\n`;

describe("createXsdValidator", () => {
	const validator = createXsdValidator(schemaFiles);

	it("accepts a valid document and reports its dataset", async () => {
		expect(
			await validator.validate(doc("<eVitals.06>120</eVitals.06>")),
		).toEqual({
			valid: true,
			dataset: "EMSDataSet",
			errors: [],
		});
	});

	it("reports element-level errors with line numbers", async () => {
		const result = await validator.validate(
			doc("<eVitals.06>900</eVitals.06>"),
		);
		expect(result.valid).toBe(false);
		expect(result.errors).toEqual([
			{
				line: 3,
				element: "eVitals.06",
				message: expect.stringMatching(/'900' is not valid|maximum value/),
			},
		]);
	});

	it("reports malformed XML as an error rather than throwing", async () => {
		const result = await validator.validate(doc("<eVitals.06>120</eVitals.6>"));
		expect(result.valid).toBe(false);
		expect(result.errors[0]?.message).toMatch(
			/mismatch|Opening and ending tag/i,
		);
	});

	it("rejects documents whose root is not a NEMSIS dataset", async () => {
		expect(
			await validator.validate(`<Other xmlns="http://www.nemsis.org"/>`),
		).toEqual({
			valid: false,
			dataset: undefined,
			errors: [
				{
					line: 1,
					message:
						"Root element <Other> is not a NEMSIS dataset (EMSDataSet, DEMDataSet, StateDataSet)",
				},
			],
		});
	});

	it("rejects datasets whose schema was not provided", async () => {
		const result = await validator.validate(
			`<DEMDataSet xmlns="http://www.nemsis.org"/>`,
		);
		expect(result).toEqual({
			valid: false,
			dataset: "DEMDataSet",
			errors: [
				{
					line: null,
					message:
						"No schema provided for DEMDataSet (expected DEMDataSet_v3.xsd)",
				},
			],
		});
	});
});

describe("loadSchemaFiles", () => {
	it("reads every .xsd in a directory, sorted by name", () => {
		const dir = mkdtempSync(join(tmpdir(), "nemsis-xsds-"));
		writeFileSync(join(dir, "b.xsd"), "<b/>");
		writeFileSync(join(dir, "a.xsd"), "<a/>");
		writeFileSync(join(dir, "notes.txt"), "x");
		expect(loadSchemaFiles(dir)).toEqual([
			{ fileName: "a.xsd", contents: "<a/>" },
			{ fileName: "b.xsd", contents: "<b/>" },
		]);
	});
});

describe("root element detection", () => {
	const validator = createXsdValidator(schemaFiles, { maxMemoryPages: 1024 });

	it("reports a document with no root element", async () => {
		expect(await validator.validate("  <!-- nothing here -->  ")).toEqual({
			valid: false,
			dataset: undefined,
			errors: [
				{
					line: null,
					message:
						"Document is not a NEMSIS dataset (EMSDataSet, DEMDataSet, StateDataSet)",
				},
			],
		});
	});

	it("skips the XML declaration, comments and DOCTYPE, and accepts a prefixed root", async () => {
		const xml = `<?xml version="1.0"?>\n<!-- a\ncomment -->\n<!DOCTYPE x>\n<n:Other xmlns:n="http://www.nemsis.org"/>`;
		const result = await validator.validate(xml);
		expect(result.errors).toEqual([
			{
				line: 5,
				message:
					"Root element <Other> is not a NEMSIS dataset (EMSDataSet, DEMDataSet, StateDataSet)",
			},
		]);
	});

	it("validates with a raised memory limit", async () => {
		expect(
			(await validator.validate(doc("<eVitals.06>1</eVitals.06>"))).valid,
		).toBe(true);
	});
});
