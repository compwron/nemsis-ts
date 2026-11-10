import { describe, expect, it } from "vitest";
import { effectiveFacets, leaves, walk } from "../../src/schema/model.ts";
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

describe("effectiveFacets on malformed input", () => {
	it("throws on a cyclic restriction chain", () => {
		const types: Record<string, SimpleType> = {
			A: { name: "A", base: "B", facets: {} },
			B: { name: "B", base: "A", facets: {} },
		};
		expect(() => effectiveFacets(types, "A")).toThrow(/Cyclic simple type A/);
	});
});

describe("walk", () => {
	it("yields every element with its ancestor path", () => {
		const root: GroupElement = {
			kind: "group",
			name: "R",
			minOccurs: 1,
			maxOccurs: 1,
			attributes: [],
			children: [leaf("a")],
		};
		expect(
			[...walk(root)].map(([el, path]) => [el.name, path.map((p) => p.name)]),
		).toEqual([
			["R", []],
			["a", ["R"]],
		]);
	});
});
