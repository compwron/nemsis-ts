/** NEMSIS 3.5.0 (`3.5.0.251001CP6`): schema model, document types and `parse`. Import as `nemsis-ts/3.5.0`. */
import { schema } from "./generated/v3_5_0/index.ts";
import type { DEMDataSet } from "./generated/v3_5_0/types/DEMDataSet.ts";
import type { EMSDataSet } from "./generated/v3_5_0/types/EMSDataSet.ts";
import type { StateDataSet } from "./generated/v3_5_0/types/StateDataSet.ts";
import { parseDocument, type TypedParseResult } from "./xml/parse.ts";

export type * from "./generated/v3_5_0/types/index.ts";
export {
	NemsisParseError,
	type ParseIssue,
	type ParseIssueCode,
} from "./xml/parse.ts";
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
