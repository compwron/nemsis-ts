/**
 * Cross-checks the generated schema model (from the XSDs) against a second official source:
 * the NEMSIS data dictionary's pipe-delimited `*_ElementDetails.txt`.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { schemas } from "../../src/generated/index.ts";
import { SUPPORTED_VERSIONS } from "../../src/index.ts";
import { effectiveFacets, leaves } from "../../src/schema/model.ts";
import type {
	DatasetName,
	LeafElement,
	SimpleType,
} from "../../src/schema/types.ts";
import { readDictionary, specRoot } from "../support/spec.ts";

const DICTIONARIES: Record<DatasetName, string> = {
	EMSDataSet: "DataDictionary/Ancillary/DEMEMS/EMSDataSet_ElementDetails.txt",
	DEMDataSet: "DataDictionary/Ancillary/DEMEMS/DEMDataSet_ElementDetails.txt",
	StateDataSet:
		"DataDictionary/Ancillary/STATE/StateDataSet_ElementDetails.txt",
};

const FACETS = [
	"minLength",
	"maxLength",
	"length",
	"minInclusive",
	"maxInclusive",
	"minExclusive",
	"totalDigits",
	"fractionDigits",
	"pattern",
] as const;

const list = (s: string): string[] =>
	s
		.split(";")
		.map((x) => x.trim())
		.filter(Boolean)
		.sort();

function fromDictionary(row: Record<string, string>) {
	return {
		name: row.ElementName,
		v2Number: row.V2Number,
		national: row.National === "National",
		state: row.State === "State",
		usage: row.Usage,
		minOccurs: row.MinOccurs,
		maxOccurs: row.MaxOccurs === "M" ? "unbounded" : row.MaxOccurs,
		nillable: row.IsNillable === "Nillable",
		dataType: row.DataType,
		nv: list(row.NVList ?? ""),
		pn: list(row.PNList ?? ""),
		pnNil: row.PNNill === "PNNill",
		facets: Object.fromEntries(FACETS.map((f) => [f, row[f] ?? ""])),
	};
}

function fromModel(
	leaf: LeafElement,
	types: Readonly<Record<string, SimpleType>>,
) {
	const union = (attr: string) =>
		[...(leaf.attributes.find((a) => a.name === attr)?.union ?? [])].sort();
	const facets = effectiveFacets(types, leaf.type);
	return {
		name: leaf.doc?.name,
		v2Number: leaf.doc?.v2Number ?? "",
		national: leaf.doc?.national,
		state: leaf.doc?.state,
		usage: leaf.doc?.usage,
		minOccurs: String(leaf.minOccurs),
		maxOccurs: String(leaf.maxOccurs),
		nillable: leaf.nillable,
		dataType: leaf.type,
		nv: union("NV"),
		pn: union("PN"),
		pnNil: leaf.doc?.pnNil === true,
		facets: Object.fromEntries(
			FACETS.map((f) => {
				const v = facets[f];
				return [
					f,
					v === undefined ? "" : Array.isArray(v) ? v.join(";") : String(v),
				];
			}),
		),
	};
}

for (const version of SUPPORTED_VERSIONS) {
	const root = specRoot(version);
	describe.skipIf(!root)(
		`data dictionary ⇔ generated schema (${version})`,
		() => {
			const schema = schemas[version];

			for (const [dataset, path] of Object.entries(DICTIONARIES) as [
				DatasetName,
				string,
			][]) {
				describe(dataset, () => {
					const rows = readDictionary(join(root ?? "", path));
					const model = new Map<string, LeafElement>();
					const duplicates: string[] = [];
					for (const leaf of leaves(schema.datasets[dataset])) {
						if (model.has(leaf.name)) duplicates.push(leaf.name);
						model.set(leaf.name, leaf);
					}

					it("has unique leaf element names", () => {
						expect(duplicates).toEqual([]);
					});

					it("has exactly the dictionary's elements", () => {
						expect([...model.keys()].sort()).toEqual(
							rows.map((r) => r.ElementNumber).sort(),
						);
					});

					it.each(rows.map((r) => [r.ElementNumber ?? "", r] as const))(
						"%s",
						(number, row) => {
							const leaf = model.get(number);
							expect(leaf, `missing ${number}`).toBeDefined();
							if (leaf)
								expect(fromModel(leaf, schema.simpleTypes)).toEqual(
									fromDictionary(row),
								);
						},
					);
				});
			}
		},
	);
}
