/**
 * Browser smoke test (Vitest browser mode, headless Chromium via Playwright): the schema model
 * loads, parsing works, and XSD validation runs on xmllint-wasm's browser build, with no Node APIs.
 */
import { describe, expect, it } from "vitest";
import { parse, schema } from "../../src/3.5.1.ts";
import { createXsdValidator } from "../../src/validate.ts";

const NS = `xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns="http://www.nemsis.org" targetNamespace="http://www.nemsis.org" elementFormDefault="qualified"`;

// Vite inlines these at build time; both are empty when `.spec/` has not been fetched.
const xsds = import.meta.glob<string>(
	"/.spec/3.5.1.251001CP2/XSDs/NEMSIS_XSDs/*.xsd",
	{
		query: "?raw",
		import: "default",
		eager: true,
	},
);
const compliance = import.meta.glob<string>(
	"/.spec/3.5.1.251001CP2/Compliance/Pre-Testing/xml/{national,fail}/*-EMS-*.xml",
	{
		query: "?raw",
		import: "default",
		eager: true,
	},
);

declare const __REQUIRE_SPEC__: boolean;

describe("in a browser", () => {
	it("has the NEMSIS fixtures when they are required (CI)", () => {
		if (__REQUIRE_SPEC__) expect(Object.keys(xsds).length).toBeGreaterThan(0);
	});

	it("really is a browser, without Node globals", () => {
		expect(navigator.userAgent).toMatch(/Chrome/);
		expect(typeof document.createElement).toBe("function");
		expect(typeof (globalThis as { process?: unknown }).process).toBe(
			"undefined",
		);
	});

	it("loads the 3.5.1 schema model", () => {
		expect(schema.version).toBe("3.5.1.251001CP2");
		expect(schema.datasets.EMSDataSet.name).toBe("EMSDataSet");
	});

	it("parses XML with saxes, with no Node APIs", () => {
		const result = parse(
			`<EMSDataSet xmlns="http://www.nemsis.org"><Header/></EMSDataSet>`,
		);
		expect(result.dataset).toBe("EMSDataSet");
		expect(result.document).toEqual({ Header: [{}] });
	});

	it("validates against an inline schema", async () => {
		const validator = createXsdValidator([
			{
				fileName: "EMSDataSet_v3.xsd",
				contents: `<xs:schema ${NS}><xs:element name="EMSDataSet"><xs:complexType><xs:sequence><xs:element name="x" type="xs:integer"/></xs:sequence></xs:complexType></xs:element></xs:schema>`,
			},
		]);
		const doc = (x: string) =>
			`<EMSDataSet xmlns="http://www.nemsis.org"><x>${x}</x></EMSDataSet>`;
		expect((await validator.validate(doc("1"))).valid).toBe(true);
		const bad = await validator.validate(doc("one"));
		expect(bad.valid).toBe(false);
		expect(bad.errors[0]?.element).toBe("x");
	});

	describe.skipIf(Object.keys(xsds).length === 0)(
		"with the real NEMSIS 3.5.1 XSDs",
		() => {
			const validator = createXsdValidator(
				Object.entries(xsds).map(([path, contents]) => ({
					fileName: path.slice(path.lastIndexOf("/") + 1),
					contents,
				})),
			);
			const file = (name: string) => {
				const entry = Object.entries(compliance).find(([path]) =>
					path.endsWith(name),
				);
				if (!entry) throw new Error(`missing ${name}`);
				return entry[1];
			};

			it("loads all 47 XSD files", () => {
				expect(Object.keys(xsds)).toHaveLength(47);
			});

			it("passes a national compliance case", async () => {
				const result = await validator.validate(
					file("national/2025-EMS-1-Overdose_v351.xml"),
				);
				expect(result.errors).toEqual([]);
			});

			it("parses a national compliance case into the typed document", () => {
				const result = parse(file("national/2025-EMS-1-Overdose_v351.xml"));
				expect(result.issues).toEqual([]);
				if (result.dataset !== "EMSDataSet") throw new Error(result.dataset);
				expect(
					result.document.Header[0]?.PatientCareReport.length,
				).toBeGreaterThan(0);
			});

			it("fails the FailXsd compliance case with the same error as in Node", async () => {
				const result = await validator.validate(
					file("fail/2025-EMS-FailXsd_v351.xml"),
				);
				expect(result.valid).toBe(false);
				expect(result.errors.map((e) => `${e.line} ${e.element}`)).toEqual([
					"121 eSituation",
				]);
			});
		},
	);
});
