/**
 * A typed model of the NEMSIS XSDs, generated per version by `scripts/codegen.ts`.
 * It mirrors the small XSD subset NEMSIS actually uses: nested `xs:sequence`s of elements,
 * leaf elements with simple content (optionally extended with attributes such as NV / PN /
 * CorrelationID), and named `xs:simpleType` restrictions/enumerations.
 */

export type DatasetName = "EMSDataSet" | "DEMDataSet" | "StateDataSet";

export type Usage = "Mandatory" | "Required" | "Recommended" | "Optional";

/** Constraining facets declared directly on a simple type (not inherited). */
export interface Facets {
	readonly minLength?: number;
	readonly maxLength?: number;
	readonly length?: number;
	readonly minInclusive?: string;
	readonly maxInclusive?: string;
	readonly minExclusive?: string;
	readonly maxExclusive?: string;
	readonly totalDigits?: number;
	readonly fractionDigits?: number;
	readonly pattern?: readonly string[];
}

export interface EnumValue {
	readonly value: string;
	readonly description?: string;
}

export interface SimpleType {
	readonly name: string;
	/** Base type: another named simple type, or a built-in such as `xs:string`. */
	readonly base: string;
	readonly facets: Facets;
	readonly enumeration?: readonly EnumValue[];
}

export interface AttributeDef {
	readonly name: string;
	readonly required: boolean;
	/** Named simple type of the attribute, when declared with `type=`. */
	readonly type?: string;
	/** Member simple types, when declared as an anonymous `xs:union` (e.g. NV / PN). */
	readonly union?: readonly string[];
}

/** The NEMSIS TAC annotation (`nemsisTacDoc`) carried by documented elements. */
export interface ElementDoc {
	readonly number: string;
	readonly name: string;
	readonly national: boolean;
	readonly state: boolean;
	readonly usage: Usage;
	readonly definition: string;
	readonly v2Number?: string;
	/** A Pertinent Negative may be sent with a nil value (`<PNNil>Yes</PNNil>`). */
	readonly pnNil?: true;
	readonly deprecated?: true;
	readonly performanceMeasures?: readonly string[];
}

interface ElementBase {
	/** XML element name, e.g. `eVitals.06` or `eVitals.VitalGroup`. */
	readonly name: string;
	readonly minOccurs: number;
	readonly maxOccurs: number | "unbounded";
	readonly attributes: readonly AttributeDef[];
	readonly doc?: ElementDoc;
}

export interface GroupElement extends ElementBase {
	readonly kind: "group";
	/** Child elements, in `xs:sequence` order. */
	readonly children: readonly ElementDef[];
}

export interface LeafElement extends ElementBase {
	readonly kind: "leaf";
	readonly nillable: boolean;
	/** Named simple type of the element's content. */
	readonly type: string;
}

export type ElementDef = GroupElement | LeafElement;

export interface VersionSchema {
	/** nemsis_public release tag, e.g. `3.5.1.251001CP2`. */
	readonly version: string;
	readonly simpleTypes: Readonly<Record<string, SimpleType>>;
	readonly datasets: Readonly<Record<DatasetName, GroupElement>>;
}
