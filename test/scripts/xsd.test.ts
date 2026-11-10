import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSchema } from "../../scripts/codegen/xsd.ts";

const NS = `xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns="http://www.nemsis.org" targetNamespace="http://www.nemsis.org" elementFormDefault="qualified"`;

const common = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema ${NS}>
	<xs:simpleType name="CorrelationID"><xs:restriction base="xs:string"><xs:minLength value="1"/><xs:maxLength value="255"/></xs:restriction></xs:simpleType>
	<xs:simpleType name="NV.NotRecorded"><xs:restriction base="xs:string"><xs:enumeration value="7701003"><xs:annotation><xs:documentation>Not Recorded</xs:documentation></xs:annotation></xs:enumeration></xs:restriction></xs:simpleType>
	<xs:simpleType name="PN.Refused"><xs:restriction base="xs:string"><xs:enumeration value="8801019"/></xs:restriction></xs:simpleType>
	<xs:simpleType name="SBP"><xs:restriction base="xs:integer"><xs:minInclusive value="0"/><xs:maxInclusive value="500"/></xs:restriction></xs:simpleType>
	<xs:simpleType name="Code"><xs:restriction base="xs:string"><xs:pattern value="[0-9]+"/></xs:restriction></xs:simpleType>
</xs:schema>`;

const section = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema ${NS}>
	<xs:include schemaLocation="common.xsd"/>
	<xs:complexType name="eVitals">
		<xs:sequence>
			<xs:element name="eVitals.VitalGroup" id="eVitals.VitalGroup" maxOccurs="unbounded">
				<xs:annotation><xs:documentation><nemsisTacDoc><number>eVitals.VitalGroup</number><name>Vitals</name><national>No</national><state>Yes</state><definition>d</definition><usage>Optional</usage></nemsisTacDoc></xs:documentation></xs:annotation>
				<xs:complexType>
					<xs:sequence>
						<xs:element name="eVitals.06" nillable="true" id="eVitals.SBP">
							<xs:annotation><xs:documentation><nemsisTacDoc>
								<number>eVitals.06</number><name>SBP (Systolic Blood Pressure)</name><national>Yes</national><state>Yes</state>
								<definition>The patient's systolic blood pressure.</definition><v2Number>E14_04</v2Number><usage>Required</usage>
								<performanceMeasuresGroup><performanceMeasure>Stroke</performanceMeasure></performanceMeasuresGroup>
								<PNNil>Yes</PNNil>
							</nemsisTacDoc></xs:documentation></xs:annotation>
							<xs:complexType><xs:simpleContent><xs:extension base="SBP">
								<xs:attribute name="PN" use="optional"><xs:simpleType><xs:union memberTypes="PN.Refused"/></xs:simpleType></xs:attribute>
								<xs:attribute name="NV" use="optional"><xs:simpleType><xs:union memberTypes="NV.NotRecorded"/></xs:simpleType></xs:attribute>
							</xs:extension></xs:simpleContent></xs:complexType>
						</xs:element>
						<xs:element name="eVitals.07" type="Code" minOccurs="0"/>
					</xs:sequence>
					<xs:attribute name="CorrelationID" type="CorrelationID" use="optional"/>
				</xs:complexType>
			</xs:element>
		</xs:sequence>
	</xs:complexType>
</xs:schema>`;

const entry = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema ${NS}>
	<xs:include schemaLocation="common.xsd"/>
	<xs:include schemaLocation="section.xsd"/>
	<xs:element name="EMSDataSet">
		<xs:complexType>
			<xs:sequence>
				<xs:element name="eVitals" type="eVitals" minOccurs="0"/>
			</xs:sequence>
		</xs:complexType>
	</xs:element>
</xs:schema>`;

function writeSchemas(): string {
	const dir = mkdtempSync(join(tmpdir(), "nemsis-xsd-"));
	writeFileSync(join(dir, "common.xsd"), common);
	writeFileSync(join(dir, "section.xsd"), section);
	writeFileSync(join(dir, "entry.xsd"), entry);
	return dir;
}

describe("readSchema", () => {
	const { root, simpleTypes } = readSchema(
		join(writeSchemas(), "entry.xsd"),
		"EMSDataSet",
	);

	it("follows xs:include and collects named simple types with facets and enumerations", () => {
		expect(Object.keys(simpleTypes).sort()).toEqual([
			"Code",
			"CorrelationID",
			"NV.NotRecorded",
			"PN.Refused",
			"SBP",
		]);
		expect(simpleTypes.SBP).toEqual({
			name: "SBP",
			base: "xs:integer",
			facets: { minInclusive: "0", maxInclusive: "500" },
		});
		expect(simpleTypes.Code?.facets).toEqual({ pattern: ["[0-9]+"] });
		expect(simpleTypes["NV.NotRecorded"]?.enumeration).toEqual([
			{ value: "7701003", description: "Not Recorded" },
		]);
		expect(simpleTypes["PN.Refused"]?.enumeration).toEqual([
			{ value: "8801019" },
		]);
	});

	it("builds the element tree, resolving named complex types", () => {
		expect(root.name).toBe("EMSDataSet");
		const eVitals = root.children[0];
		expect(eVitals).toMatchObject({
			kind: "group",
			name: "eVitals",
			minOccurs: 0,
			maxOccurs: 1,
		});
		const group = eVitals?.kind === "group" ? eVitals.children[0] : undefined;
		expect(group).toMatchObject({
			kind: "group",
			name: "eVitals.VitalGroup",
			minOccurs: 1,
			maxOccurs: "unbounded",
			attributes: [
				{ name: "CorrelationID", required: false, type: "CorrelationID" },
			],
			doc: {
				number: "eVitals.VitalGroup",
				national: false,
				state: true,
				usage: "Optional",
			},
		});
	});

	it("models leaves with simple content, attributes and nemsisTacDoc", () => {
		const eVitals = root.children[0];
		const group = eVitals?.kind === "group" ? eVitals.children[0] : undefined;
		const [sbp, code] = group?.kind === "group" ? group.children : [];
		expect(sbp).toEqual({
			kind: "leaf",
			name: "eVitals.06",
			minOccurs: 1,
			maxOccurs: 1,
			nillable: true,
			type: "SBP",
			attributes: [
				{ name: "PN", required: false, union: ["PN.Refused"] },
				{ name: "NV", required: false, union: ["NV.NotRecorded"] },
			],
			doc: {
				number: "eVitals.06",
				name: "SBP (Systolic Blood Pressure)",
				national: true,
				state: true,
				usage: "Required",
				definition: "The patient's systolic blood pressure.",
				v2Number: "E14_04",
				pnNil: true,
				performanceMeasures: ["Stroke"],
			},
		});
		expect(code).toEqual({
			kind: "leaf",
			name: "eVitals.07",
			minOccurs: 0,
			maxOccurs: 1,
			nillable: false,
			type: "Code",
			attributes: [],
		});
	});

	it("rejects XSD constructs the generator does not model", () => {
		const dir = writeSchemas();
		writeFileSync(
			join(dir, "bad.xsd"),
			`<xs:schema ${NS}><xs:element name="EMSDataSet"><xs:complexType><xs:choice/></xs:complexType></xs:element></xs:schema>`,
		);
		expect(() => readSchema(join(dir, "bad.xsd"), "EMSDataSet")).toThrow(
			/xs:choice/,
		);
	});
});
