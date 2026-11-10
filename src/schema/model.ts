import type {
	ElementDef,
	Facets,
	GroupElement,
	LeafElement,
	SimpleType,
} from "./types.ts";

/** Leaf elements under `root`, depth-first in sequence order. */
export function* leaves(root: ElementDef): Generator<LeafElement> {
	if (root.kind === "leaf") {
		yield root;
		return;
	}
	for (const child of root.children) yield* leaves(child);
}

/** All elements under (and including) `root`, depth-first. */
export function* walk(
	root: ElementDef,
	path: readonly GroupElement[] = [],
): Generator<[ElementDef, readonly GroupElement[]]> {
	yield [root, path];
	if (root.kind === "group")
		for (const child of root.children) yield* walk(child, [...path, root]);
}

/** Facets in force for a simple type: its own, plus those inherited from named base types. */
export function effectiveFacets(
	types: Readonly<Record<string, SimpleType>>,
	name: string,
): Facets {
	const chain: SimpleType[] = [];
	for (let t = types[name]; t !== undefined; t = types[t.base]) {
		if (chain.includes(t)) throw new Error(`Cyclic simple type ${name}`);
		chain.push(t);
	}
	const facets: Facets = {};
	for (const t of chain.reverse()) Object.assign(facets, t.facets);
	return facets;
}
