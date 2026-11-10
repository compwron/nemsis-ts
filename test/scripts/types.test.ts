import { describe, expect, it } from "vitest";
import {
	emitDatasetTypes,
	emitSimpleTypes,
	interfaceName,
	typeName,
} from "../../scripts/codegen/types.ts";
import type { GroupElement, SimpleType } from "../../src/schema/types.ts";

describe("names", () => {
	it("mangles simple type names into identifiers", () => {
		expect(typeName("NV.NotRecorded")).toBe("NV_NotRecorded");
		expect(typeName("SBP")).toBe("SBP");
	});

	it("derives PascalCase interface names from element names", () => {
		expect(interfaceName("eVitals.VitalGroup")).toBe("EVitalsVitalGroup");
		expect(interfaceName("PatientCareReport")).toBe("PatientCareReport");
		expect(interfaceName("eCustomConfiguration.CustomGroup")).toBe(
			"ECustomConfigurationCustomGroup",
		);
	});
});

describe("emitSimpleTypes", () => {
	const types: Record<string, SimpleType> = {
		SBP: {
			name: "SBP",
			base: "xs:integer",
			facets: { minInclusive: "0", maxInclusive: "500" },
		},
		"NV.NotRecorded": {
			name: "NV.NotRecorded",
			base: "xs:string",
			facets: {},
			enumeration: [{ value: "7701003", description: "Not Recorded" }],
		},
	};
	const out = emitSimpleTypes(types);

	it("emits non-enumerated types as string aliases documenting base and facets", () => {
		expect(out).toContain(
			"/** `SBP`: xs:integer; minInclusive 0; maxInclusive 500 */\nexport type SBP = string;",
		);
	});

	it("emits enumerations as code unions with descriptions", () => {
		expect(out).toContain(
			'export type NV_NotRecorded =\n\t/** Not Recorded */\n\t| "7701003";',
		);
	});
});

describe("emitDatasetTypes", () => {
	const root: GroupElement = {
		kind: "group",
		name: "EMSDataSet",
		minOccurs: 1,
		maxOccurs: 1,
		attributes: [],
		children: [
			{
				kind: "group",
				name: "eVitals.VitalGroup",
				minOccurs: 0,
				maxOccurs: "unbounded",
				attributes: [
					{ name: "CorrelationID", required: false, type: "CorrelationID" },
				],
				doc: {
					number: "eVitals.VitalGroup",
					name: "Vitals",
					national: false,
					state: false,
					usage: "Optional",
					definition: "",
				},
				children: [
					{
						kind: "leaf",
						name: "eVitals.06",
						minOccurs: 1,
						maxOccurs: 1,
						nillable: true,
						type: "SBP",
						attributes: [
							{
								name: "NV",
								required: false,
								union: ["NV.NotApplicable", "NV.NotRecorded"],
							},
						],
						doc: {
							number: "eVitals.06",
							name: "SBP (Systolic Blood Pressure)",
							national: true,
							state: true,
							usage: "Required",
							definition: "The patient's systolic blood pressure.",
						},
					},
					{
						kind: "leaf",
						name: "eVitals.07",
						minOccurs: 0,
						maxOccurs: 1,
						nillable: false,
						type: "Code",
						attributes: [],
					},
					{
						kind: "leaf",
						name: "eVitals.08",
						minOccurs: 0,
						maxOccurs: 2,
						nillable: false,
						type: "Code",
						attributes: [{ name: "UUID", required: true, type: "UUID" }],
					},
				],
			},
		],
	};
	const out = emitDatasetTypes(root);

	it("emits one interface per group with attributes then children in sequence order", () => {
		expect(out).toContain(
			[
				"/** eVitals.VitalGroup: Vitals (Optional) */",
				"export interface EVitalsVitalGroup {",
				"\tCorrelationID?: codes.CorrelationID;",
				"\t/**",
				"\t * eVitals.06: SBP (Systolic Blood Pressure) (Required, National, State)",
				"\t *",
				"\t * The patient's systolic blood pressure.",
				"\t */",
				'\t"eVitals.06": NillableLeaf<codes.SBP, { NV?: codes.NV_NotApplicable | codes.NV_NotRecorded }>;',
				'\t"eVitals.07"?: codes.Code;',
				'\t"eVitals.08"?: Leaf<codes.Code, { UUID: codes.UUID }>[];',
				"}",
			].join("\n"),
		);
	});

	it("types repeating children as arrays", () => {
		expect(out).toContain('\t"eVitals.VitalGroup"?: EVitalsVitalGroup[];');
		expect(out).toContain("export interface EMSDataSet {");
	});
});
