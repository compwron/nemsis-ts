import { describe, expect, it } from "vitest";
import type {
	GroupElement,
	LeafElement,
	VersionSchema,
} from "../../src/schema/types.ts";
import { NemsisParseError, parseDocument } from "../../src/xml/parse.ts";

const leaf = (name: string, extra: Partial<LeafElement> = {}): LeafElement => ({
	kind: "leaf",
	name,
	minOccurs: 0,
	maxOccurs: 1,
	nillable: false,
	type: "T",
	attributes: [],
	...extra,
});

const group = (
	name: string,
	children: GroupElement["children"],
	extra: Partial<GroupElement> = {},
): GroupElement => ({
	kind: "group",
	name,
	minOccurs: 1,
	maxOccurs: 1,
	attributes: [],
	children,
	...extra,
});

const nvpn = [
	{ name: "NV", required: false, union: ["NV.NotRecorded"] },
	{ name: "PN", required: false, union: ["PN.Refused"] },
];

/** A miniature EMSDataSet: Header[] > (eRecord.01, eVitals.VitalGroup[] > (eVitals.06, eVitals.07[])). */
const schema: VersionSchema = {
	version: "3.5.9.990101",
	simpleTypes: {},
	datasets: {
		EMSDataSet: group("EMSDataSet", [
			group(
				"Header",
				[
					leaf("eRecord.01", { minOccurs: 1 }),
					group(
						"eVitals.VitalGroup",
						[
							leaf("eVitals.06", {
								minOccurs: 1,
								nillable: true,
								attributes: nvpn,
							}),
							leaf("eVitals.07", { maxOccurs: "unbounded" }),
							leaf("eVitals.08", {
								attributes: [
									{
										name: "CorrelationID",
										required: false,
										type: "CorrelationID",
									},
								],
							}),
						],
						{
							minOccurs: 0,
							maxOccurs: "unbounded",
							attributes: [
								{
									name: "CorrelationID",
									required: false,
									type: "CorrelationID",
								},
							],
						},
					),
				],
				{
					maxOccurs: "unbounded",
					attributes: [{ name: "UUID", required: true, type: "UUID" }],
				},
			),
		]),
		DEMDataSet: group("DEMDataSet", []),
		StateDataSet: group("StateDataSet", []),
	},
};

const XSI = `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`;
const ems = (body: string, attrs = "") =>
	`<?xml version="1.0" encoding="UTF-8"?>\n<EMSDataSet xmlns="http://www.nemsis.org" ${XSI}${attrs}>\n${body}\n</EMSDataSet>\n`;

describe("parseDocument", () => {
	it("builds the typed document: plain leaves, nil/NV/PN leaves, attributes and arrays", () => {
		const result = parseDocument(
			ems(`<Header UUID="u-1">
				<eRecord.01>R1</eRecord.01>
				<eVitals.VitalGroup CorrelationID="v1">
					<eVitals.06 xsi:nil="true" NV="7701003"/>
					<eVitals.07>a</eVitals.07>
					<eVitals.07>b</eVitals.07>
					<eVitals.08 CorrelationID="c">x</eVitals.08>
				</eVitals.VitalGroup>
				<eVitals.VitalGroup>
					<eVitals.06>120</eVitals.06>
				</eVitals.VitalGroup>
				<eVitals.VitalGroup>
					<eVitals.06 xsi:nil="true" PN="8801019"/>
				</eVitals.VitalGroup>
			</Header>`),
			schema,
		);
		expect(result.issues).toEqual([]);
		expect(result.dataset).toBe("EMSDataSet");
		expect(result.document).toEqual({
			Header: [
				{
					UUID: "u-1",
					"eRecord.01": "R1",
					"eVitals.VitalGroup": [
						{
							CorrelationID: "v1",
							"eVitals.06": { nil: true, NV: "7701003" },
							"eVitals.07": ["a", "b"],
							"eVitals.08": { value: "x", CorrelationID: "c" },
						},
						{ "eVitals.06": { value: "120" } },
						{ "eVitals.06": { nil: true, PN: "8801019" } },
					],
				},
			],
		});
	});

	it("keeps values exactly as written: whitespace, entities, character references and CDATA", () => {
		const result = parseDocument(
			ems(
				`<Header UUID="u"><eRecord.01>  a &amp; b &#x2019;<![CDATA[<c>]]> </eRecord.01></Header>`,
			),
			schema,
		);
		expect(result.document).toEqual({
			Header: [{ UUID: "u", "eRecord.01": "  a & b ’<c> " }],
		});
	});

	it("keeps an empty non-nil value and treats xsi:nil='false' as not nil", () => {
		const result = parseDocument(
			ems(
				`<Header UUID="u"><eRecord.01></eRecord.01><eVitals.VitalGroup><eVitals.06 xsi:nil="false">1</eVitals.06></eVitals.VitalGroup></Header>`,
			),
			schema,
		);
		expect(result.document).toEqual({
			Header: [
				{
					UUID: "u",
					"eRecord.01": "",
					"eVitals.VitalGroup": [{ "eVitals.06": { value: "1" } }],
				},
			],
		});
	});

	it("accepts a prefixed NEMSIS namespace and any xsi prefix", () => {
		const xml = `<n:EMSDataSet xmlns:n="http://www.nemsis.org" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><n:Header UUID="u"><n:eRecord.01>R</n:eRecord.01><n:eVitals.VitalGroup><n:eVitals.06 i:nil="1"/></n:eVitals.VitalGroup></n:Header></n:EMSDataSet>`;
		const result = parseDocument(xml, schema);
		expect(result.issues).toEqual([]);
		expect(result.document).toEqual({
			Header: [
				{
					UUID: "u",
					"eRecord.01": "R",
					"eVitals.VitalGroup": [{ "eVitals.06": { nil: true } }],
				},
			],
		});
	});

	it("reports the root xsi:schemaLocation", () => {
		const result = parseDocument(
			ems(
				`<Header UUID="u"><eRecord.01>R</eRecord.01></Header>`,
				` xsi:schemaLocation="http://www.nemsis.org x.xsd"`,
			),
			schema,
		);
		expect(result.schemaLocation).toBe("http://www.nemsis.org x.xsd");
		expect(result.issues).toEqual([]);
	});

	describe("issues (document still returned)", () => {
		const issues = (body: string) =>
			parseDocument(ems(body), schema).issues.map(({ code, path, line }) => ({
				code,
				path,
				line,
			}));

		it("unknown elements are reported and skipped with their content", () => {
			expect(
				issues(
					`<Header UUID="u"><eRecord.01>R</eRecord.01><eBogus.01><x/></eBogus.01></Header>`,
				),
			).toEqual([
				{
					code: "unknown-element",
					path: "EMSDataSet/Header[0]/eBogus.01",
					line: 3,
				},
			]);
		});

		it("elements outside the NEMSIS namespace are unknown", () => {
			expect(
				issues(
					`<Header UUID="u" xmlns:o="urn:other"><eRecord.01>R</eRecord.01><o:eRecord.01>X</o:eRecord.01></Header>`,
				),
			).toEqual([
				{
					code: "unknown-element",
					path: "EMSDataSet/Header[0]/{urn:other}eRecord.01",
					line: 3,
				},
			]);
		});

		it("unknown attributes", () => {
			expect(
				issues(
					`<Header UUID="u" Extra="1"><eRecord.01 NV="7701003">R</eRecord.01></Header>`,
				),
			).toEqual([
				{
					code: "unknown-attribute",
					path: "EMSDataSet/Header[0]/@Extra",
					line: 3,
				},
				{
					code: "unknown-attribute",
					path: "EMSDataSet/Header[0]/eRecord.01/@NV",
					line: 3,
				},
			]);
		});

		it("missing required elements and attributes", () => {
			expect(issues(`<Header><eVitals.VitalGroup/></Header>`)).toEqual([
				{
					code: "missing-attribute",
					path: "EMSDataSet/Header[0]/@UUID",
					line: 3,
				},
				{
					code: "missing-element",
					path: "EMSDataSet/Header[0]/eVitals.VitalGroup[0]/eVitals.06",
					line: 3,
				},
				{
					code: "missing-element",
					path: "EMSDataSet/Header[0]/eRecord.01",
					line: 3,
				},
			]);
		});

		it("too many occurrences (extra occurrences are dropped)", () => {
			const r = parseDocument(
				ems(
					`<Header UUID="u"><eRecord.01>A</eRecord.01><eRecord.01>B</eRecord.01></Header>`,
				),
				schema,
			);
			expect(r.issues.map((i) => [i.code, i.path])).toEqual([
				["too-many", "EMSDataSet/Header[0]/eRecord.01"],
			]);
			expect(r.document).toEqual({
				Header: [{ UUID: "u", "eRecord.01": "A" }],
			});
		});

		it("nil for a non-nillable element, nil with content, and stray text or child elements", () => {
			expect(
				issues(
					`<Header UUID="u">stray<eRecord.01 xsi:nil="true"/><eVitals.VitalGroup><eVitals.06 xsi:nil="true">5</eVitals.06><eVitals.07><b/></eVitals.07></eVitals.VitalGroup></Header>`,
				),
			).toEqual([
				{ code: "unexpected-text", path: "EMSDataSet/Header[0]", line: 3 },
				{
					code: "not-nillable",
					path: "EMSDataSet/Header[0]/eRecord.01",
					line: 3,
				},
				{
					code: "nil-with-content",
					path: "EMSDataSet/Header[0]/eVitals.VitalGroup[0]/eVitals.06",
					line: 3,
				},
				{
					code: "unknown-element",
					path: "EMSDataSet/Header[0]/eVitals.VitalGroup[0]/eVitals.07[0]/b",
					line: 3,
				},
			]);
		});

		it("every issue carries a human-readable message", () => {
			const [issue] = parseDocument(
				ems(`<Header UUID="u"><eRecord.01>R</eRecord.01><eNope/></Header>`),
				schema,
			).issues;
			expect(issue?.message).toBe("Unexpected element <eNope> in <Header>");
			expect(issue?.column).toBeGreaterThan(0);
		});
	});

	describe("errors (thrown)", () => {
		it("malformed XML, with position", () => {
			expect(() =>
				parseDocument(
					ems(`<Header UUID="u"><eRecord.01>R</eRecord.0></Header>`),
					schema,
				),
			).toThrow(NemsisParseError);
			try {
				parseDocument(
					ems(`<Header UUID="u"><eRecord.01>R</eRecord.0></Header>`),
					schema,
				);
			} catch (e) {
				expect((e as NemsisParseError).line).toBe(3);
			}
		});

		it("a DOCTYPE (never used by NEMSIS; rejected to rule out entity tricks)", () => {
			expect(() =>
				parseDocument(
					`<!DOCTYPE x [<!ENTITY a "aaaa">]><EMSDataSet xmlns="http://www.nemsis.org"/>`,
					schema,
				),
			).toThrow(/DOCTYPE is not allowed/);
		});

		it("a root that is not a NEMSIS dataset", () => {
			expect(() =>
				parseDocument(`<Other xmlns="http://www.nemsis.org"/>`, schema),
			).toThrow(/Root element <Other> is not a NEMSIS dataset/);
			expect(() => parseDocument(`<EMSDataSet/>`, schema)).toThrow(
				/Root element <EMSDataSet> is not in the NEMSIS namespace/,
			);
		});

		it("an empty document", () => {
			expect(() => parseDocument("  ", schema)).toThrow(NemsisParseError);
		});
	});
});
