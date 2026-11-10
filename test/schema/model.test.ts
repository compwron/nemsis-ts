import { describe, expect, it } from "vitest";
import { effectiveFacets, leaves } from "../../src/schema/model.ts";
import type { GroupElement, SimpleType } from "../../src/schema/types.ts";

const leaf = (name: string) =>
	({
		kind: "leaf",
		name,
		minOccurs: 0,
		maxOccurs: 1,
		attributes: [],
		nillable: false,
		type: "T",
	}) as const;

describe("leaves", () => {
	it("yields leaf elements depth-first in sequence order", () => {
		const root: GroupElement = {
			kind: "group",
			name: "Root",
			minOccurs: 1,
			maxOccurs: 1,
			attributes: [],
			children: [
				leaf("a"),
				{
					kind: "group",
					name: "G",
					minOccurs: 0,
					maxOccurs: "unbounded",
					attributes: [],
					children: [leaf("b")],
				},
				leaf("c"),
			],
		};
		expect([...leaves(root)].map((l) => l.name)).toEqual(["a", "b", "c"]);
	});
});

describe("effectiveFacets", () => {
	const types: Record<string, SimpleType> = {
		Base: {
			name: "Base",
			base: "xs:string",
			facets: { minLength: 1, maxLength: 50, pattern: ["[A-Z]+"] },
		},
		Derived: { name: "Derived", base: "Base", facets: { maxLength: 10 } },
	};

	it("merges facets down the restriction chain, nearest declaration winning", () => {
		expect(effectiveFacets(types, "Derived")).toEqual({
			minLength: 1,
			maxLength: 10,
			pattern: ["[A-Z]+"],
		});
	});

	it("returns no facets for built-in types", () => {
		expect(effectiveFacets(types, "xs:string")).toEqual({});
	});
});
