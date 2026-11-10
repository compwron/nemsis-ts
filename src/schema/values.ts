/**
 * Shapes of leaf element values in typed NEMSIS documents.
 *
 * Values are kept as their XML lexical strings (e.g. `"120"`, `"2026-01-01T08:00:00-05:00"`)
 * so documents round-trip exactly; enumerated types narrow to their code unions.
 */

type NoAttributes = Record<never, never>;

/** A leaf with simple content and attributes (e.g. `CorrelationID`, `PhoneNumberType`). */
export type Leaf<V, A extends object = NoAttributes> = {
	value: V;
	nil?: never;
} & A;

/**
 * A nillable leaf: either a value, or `nil: true` (`xsi:nil="true"`), usually with an NV
 * (Not Value) or PN (Pertinent Negative) attribute explaining why.
 */
export type NillableLeaf<V, A extends object = NoAttributes> = (
	| { value: V; nil?: never }
	| { nil: true; value?: never }
) &
	A;
