/** A hand-built miniature schema model for parser/serializer unit tests. */
import type {
	GroupElement,
	LeafElement,
	VersionSchema,
} from "../../src/schema/types.ts";

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
export const schema: VersionSchema = {
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
