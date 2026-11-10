/** NEMSIS 3.5.0 (`3.5.0.251001CP6`): schema model, document types, `parse` and `serialize`. Import as `nemsis-ts/3.5.0`. */
import { schema } from "./generated/v3_5_0/index.ts";
import type { DEMDataSet } from "./generated/v3_5_0/types/DEMDataSet.ts";
import type { EMSDataSet } from "./generated/v3_5_0/types/EMSDataSet.ts";
import type { StateDataSet } from "./generated/v3_5_0/types/StateDataSet.ts";
import { parseDocument, type TypedParseResult } from "./xml/parse.ts";
import { type SerializeOptions, serializeDocument } from "./xml/serialize.ts";

export type * from "./generated/v3_5_0/types/index.ts";
export {
	NemsisParseError,
	type ParseIssue,
	type ParseIssueCode,
} from "./xml/parse.ts";
export {
	NemsisSerializeError,
	type SerializeOptions,
} from "./xml/serialize.ts";
export { schema };

/** The result of {@link parse}: narrow on `dataset` to get the matching document type. */
export type ParseResult = TypedParseResult<{
	EMSDataSet: EMSDataSet;
	DEMDataSet: DEMDataSet;
	StateDataSet: StateDataSet;
}>;

/**
 * Parse a NEMSIS 3.5.0 XML document (EMS, DEM or State dataset). Malformed XML throws
 * `NemsisParseError`; content the schema cannot place is reported in `issues`.
 */
export function parse(xml: string): ParseResult {
	return parseDocument(xml, schema) as unknown as ParseResult;
}

/** A document to serialize: a {@link ParseResult} works as is. */
export type Serializable =
	| {
			readonly dataset: "EMSDataSet";
			readonly document: EMSDataSet;
			readonly schemaLocation?: string;
	  }
	| {
			readonly dataset: "DEMDataSet";
			readonly document: DEMDataSet;
			readonly schemaLocation?: string;
	  }
	| {
			readonly dataset: "StateDataSet";
			readonly document: StateDataSet;
			readonly schemaLocation?: string;
	  };

/**
 * Write a NEMSIS 3.5.0 document as XML, elements in schema order. The `schemaLocation` option
 * defaults to the input's (so a parsed document round-trips). Throws `NemsisSerializeError`
 * for shapes the schema cannot hold; validity is checked by `nemsis-ts/validate`.
 */
export function serialize(
	input: Serializable,
	options: SerializeOptions = {},
): string {
	const schemaLocation = options.schemaLocation ?? input.schemaLocation;
	return serializeDocument(
		input.dataset,
		input.document as unknown as Record<string, unknown>,
		schema,
		{
			...options,
			...(schemaLocation === undefined ? {} : { schemaLocation }),
		},
	);
}
