/** Lookups over a version's defined lists. */
import type { DefinedList, DefinedListCode } from "./types.ts";

export type * from "./types.ts";

export interface DefinedListMatch {
	readonly list: DefinedList;
	readonly code: DefinedListCode;
}

export interface ListIndex {
	readonly lists: readonly DefinedList[];
	/** A list by name (`Symptom`). */
	list(name: string): DefinedList | undefined;
	/** Lists that apply to a NEMSIS element (`eSituation.09`); empty when none do. */
	listsForElement(element: string): readonly DefinedList[];
	/** A code in a named list. Pass `codeType` to tell apart lists that mix vocabularies. */
	lookup(
		listName: string,
		value: string,
		codeType?: string,
	): DefinedListCode | undefined;
	/** A code in any list that applies to `element`. */
	find(
		element: string,
		value: string,
		codeType?: string,
	): DefinedListMatch | undefined;
}

const matches = (c: DefinedListCode, codeType: string | undefined) =>
	codeType === undefined || c.codeType === codeType;

/** Build lookup indexes over `lists` (once; lookups are then map reads). */
export function createListIndex(lists: readonly DefinedList[]): ListIndex {
	const byName = new Map(lists.map((l) => [l.name, l]));
	const byValue = new Map(
		lists.map((l) => {
			const m = new Map<string, DefinedListCode[]>();
			for (const c of l.codes) m.set(c.value, [...(m.get(c.value) ?? []), c]);
			return [l.name, m] as const;
		}),
	);
	const byElement = new Map<string, DefinedList[]>();
	for (const l of lists) {
		for (const e of l.nemsisElements)
			byElement.set(e, [...(byElement.get(e) ?? []), l]);
	}
	const lookup: ListIndex["lookup"] = (listName, value, codeType) =>
		byValue
			.get(listName)
			?.get(value)
			?.find((c) => matches(c, codeType));
	return {
		lists,
		list: (name) => byName.get(name),
		listsForElement: (element) => byElement.get(element) ?? [],
		lookup,
		find(element, value, codeType) {
			for (const list of byElement.get(element) ?? []) {
				const code = lookup(list.name, value, codeType);
				if (code) return { list, code };
			}
			return undefined;
		},
	};
}
