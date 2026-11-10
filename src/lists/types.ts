/**
 * NEMSIS "defined lists": suggested code sets (ICD-10, SNOMED CT, RxNorm, ...) that NEMSIS
 * publishes for a few free-text-or-coded elements. They are suggestions, not exhaustive
 * enumerations: a document may legitimately carry a code that is not in the list.
 */
export interface DefinedListVocabulary {
	/** e.g. `ICD-10`, `SNOMED-CT`, `RxNorm`. */
	readonly name: string;
	readonly url?: string;
	/** NEMSIS CodeType (e.g. `9924003` for RxNorm), when the list declares one. */
	readonly codeType?: string;
}

export interface DefinedListCode {
	readonly value: string;
	/** NEMSIS CodeType of this code, when the list mixes several vocabularies. */
	readonly codeType?: string;
	readonly category?: string;
	/** The preferred term in the source vocabulary. */
	readonly sourceLabel: string;
	/** NEMSIS's suggested display label. */
	readonly suggestedLabel: string;
	readonly note?: string;
	/** Date this entry was added or last changed (`YYYY-MM-DD`). */
	readonly date: string;
}

export interface DefinedList {
	/** File/list name, e.g. `Symptom`. */
	readonly name: string;
	/** Date of this list's publication (`YYYY-MM-DD`). */
	readonly date: string;
	readonly sourceVocabularies: readonly DefinedListVocabulary[];
	/** NEMSIS XSD types the list applies to, e.g. `AssociatedSymptoms`. */
	readonly nemsisTypes: readonly string[];
	/** NEMSIS elements the list applies to, e.g. `eSituation.09`. */
	readonly nemsisElements: readonly string[];
	readonly codes: readonly DefinedListCode[];
}
