/**
 * The XSD reader must fail loudly on anything outside the subset it models, so a future NEMSIS
 * release that changes shape breaks codegen instead of silently producing a wrong model.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSchema } from "../../scripts/codegen/xsd.ts";

const NS = `xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns="http://www.nemsis.org" targetNamespace="http://www.nemsis.org" elementFormDefault="qualified"`;
const S = `<xs:simpleType name="S"><xs:restriction base="xs:string"/></xs:simpleType>`;

const tacDoc = (fields: Record<string, string>) =>
	`<xs:annotation><xs:documentation><nemsisTacDoc>${Object.entries(fields)
		.map(([k, v]) => `<${k}>${v}</${k}>`)
		.join("")}</nemsisTacDoc></xs:documentation></xs:annotation>`;
const doc = {
	number: "x.01",
	name: "X",
	national: "Yes",
	state: "No",
	definition: "d",
	usage: "Optional",
};

/** Wrap `children` as the sequence of a root group element named `Root`. */
const root = (children: string, extra = "") =>
	`<xs:schema ${NS}>${S}${extra}<xs:element name="Root"><xs:complexType><xs:sequence>${children}</xs:sequence></xs:complexType></xs:element></xs:schema>`;

function read(xsd: string, rootElement = "Root") {
	const dir = mkdtempSync(join(tmpdir(), "nemsis-xsd-err-"));
	writeFileSync(join(dir, "entry.xsd"), xsd);
	return () => readSchema(join(dir, "entry.xsd"), rootElement);
}

const cases: [string, string, RegExp, string?][] = [
	["a file that is not a schema", "<foo/>", /no <xs:schema>/],
	[
		"an unsupported top-level construct",
		`<xs:schema ${NS}><xs:group name="G"/></xs:schema>`,
		/Unsupported XSD construct <xs:group>/,
	],
	[
		"a simple type without a restriction",
		root("", `<xs:simpleType name="T"><xs:annotation/></xs:simpleType>`),
		/simpleType T: only xs:restriction is supported/,
	],
	[
		"a simple type defined by xs:union",
		root(
			"",
			`<xs:simpleType name="T"><xs:union memberTypes="S"/></xs:simpleType>`,
		),
		/Unsupported XSD construct <xs:union> in simpleType T/,
	],
	[
		"an unsupported facet",
		root(
			"",
			`<xs:simpleType name="T"><xs:restriction base="xs:string"><xs:whiteSpace value="collapse"/></xs:restriction></xs:simpleType>`,
		),
		/Unsupported XSD construct <xs:whiteSpace> in simpleType T/,
	],
	[
		"a national flag that is not Yes/No",
		root(
			`<xs:element name="x.01" type="S">${tacDoc({ ...doc, national: "Maybe" })}</xs:element>`,
		),
		/x\.01: <national> is "Maybe"/,
	],
	[
		"a missing required Yes/No flag",
		root(
			`<xs:element name="x.01" type="S">${tacDoc({ number: "x.01", name: "X", national: "Yes", definition: "d", usage: "Optional" })}</xs:element>`,
		),
		/x\.01: <state> is undefined/,
	],
	[
		"an unknown usage",
		root(
			`<xs:element name="x.01" type="S">${tacDoc({ ...doc, usage: "Sometimes" })}</xs:element>`,
		),
		/x\.01: unknown usage "Sometimes"/,
	],
	[
		"an attribute with neither type= nor a union",
		root(
			`<xs:element name="x.01"><xs:complexType><xs:simpleContent><xs:extension base="S"><xs:attribute name="A"/></xs:extension></xs:simpleContent></xs:complexType></xs:element>`,
		),
		/element x\.01@A: attribute needs type= or an xs:union/,
	],
	[
		"a complex type with neither a sequence nor simple content",
		root(
			`<xs:element name="x.01"><xs:complexType><xs:attribute name="A" type="S"/></xs:complexType></xs:element>`,
		),
		/element x\.01: complexType needs xs:sequence or xs:simpleContent\/xs:extension/,
	],
	[
		"a complex type with xs:choice",
		root(
			`<xs:element name="x.01"><xs:complexType><xs:choice/></xs:complexType></xs:element>`,
		),
		/Unsupported XSD construct <xs:choice> in element x\.01/,
	],
	[
		"two sequences in one complex type",
		root(
			`<xs:element name="x.01"><xs:complexType><xs:sequence/><xs:sequence/></xs:complexType></xs:element>`,
		),
		/Expected at most one <xs:sequence>/,
	],
	[
		"an element with both type= and an inline complex type",
		root(
			`<xs:element name="x.01" type="S"><xs:complexType><xs:sequence/></xs:complexType></xs:element>`,
		),
		/element x\.01: both type= and an inline complexType/,
	],
	[
		"an element with no type",
		root(`<xs:element name="x.01"/>`),
		/element x\.01: no type/,
	],
	[
		"an element with an inline simple type",
		root(
			`<xs:element name="x.01"><xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType></xs:element>`,
		),
		/Unsupported XSD construct <xs:simpleType> in element x\.01/,
	],
	[
		"a nillable group",
		root(
			`<xs:element name="G" nillable="true"><xs:complexType><xs:sequence/></xs:complexType></xs:element>`,
		),
		/element G: nillable groups are not supported/,
	],
	[
		"a missing root element",
		root(""),
		/No top-level element Missing/,
		"Missing",
	],
	[
		"a root that is not a group",
		`<xs:schema ${NS}>${S}<xs:element name="Root" type="S"/></xs:schema>`,
		/Root is not a group/,
	],
];

describe("readSchema rejects", () => {
	it.each(cases)("%s", (_label, xsd, error, rootElement) => {
		expect(read(xsd, rootElement)).toThrow(error);
	});
});

describe("readSchema accepts", () => {
	it("an include of an already-loaded file (include cycles)", () => {
		const dir = mkdtempSync(join(tmpdir(), "nemsis-xsd-cycle-"));
		writeFileSync(
			join(dir, "a.xsd"),
			`<xs:schema ${NS}><xs:annotation/><xs:include schemaLocation="b.xsd"/>${S}</xs:schema>`,
		);
		writeFileSync(
			join(dir, "b.xsd"),
			`<xs:schema ${NS}><xs:include schemaLocation="a.xsd"/><xs:element name="Root"><xs:complexType><xs:sequence><xs:element name="x" type="S"/></xs:sequence></xs:complexType></xs:element></xs:schema>`,
		);
		expect(readSchema(join(dir, "a.xsd"), "Root").root.children).toHaveLength(
			1,
		);
	});

	it("deprecated elements and minimal documentation", () => {
		const { root: r } = readSchema(
			(() => {
				const dir = mkdtempSync(join(tmpdir(), "nemsis-xsd-dep-"));
				writeFileSync(
					join(dir, "e.xsd"),
					root(
						`<xs:element name="x.01" type="S" maxOccurs="3">${tacDoc({ ...doc, deprecated: "Yes" })}</xs:element>`,
					),
				);
				return join(dir, "e.xsd");
			})(),
			"Root",
		);
		expect(r.children[0]).toMatchObject({
			maxOccurs: 3,
			doc: { deprecated: true, national: true, state: false },
		});
		expect(r.children[0]?.doc).not.toHaveProperty("v2Number");
		expect(r.children[0]?.doc).not.toHaveProperty("pnNil");
	});
});
