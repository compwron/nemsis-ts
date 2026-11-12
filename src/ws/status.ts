/**
 * Status codes of the NEMSIS web-service WSDL (`NEMSIS_V3_core.wsdl`): the descriptions are the
 * WSDL's own words (a golden test compares this table with the WSDL's enumerations).
 */
export type WsStatusKind = "success" | "partial" | "pending" | "error";

export interface WsStatus {
	readonly code: number;
	/**
	 * `success`: the work was accepted (possibly with warnings); `partial`: partly imported;
	 * `pending`: not finished yet, retrieve the status again; `error`: failed (or an unrecognised code).
	 */
	readonly kind: WsStatusKind;
	readonly description: string;
	/** A state- or vendor-specific code (above 100 or below -100). */
	readonly custom: boolean;
}

interface Entry {
	readonly kind: WsStatusKind;
	readonly description: string;
}

const e = (kind: WsStatusKind, description: string): Entry => ({
	kind,
	description,
});

export const WS_STATUS_CODES: Readonly<Record<number, Entry>> = {
	"-3": e("error", "Permission denied to the client for that organization"),
	"-2": e("error", "Permission denied to the client for the operation"),
	"-1": e("error", "Invalid username and/or password"),
	"-4": e("error", "Invalid parameter value"),
	"-5": e("error", "Invalid parameter combination"),
	"-20": e("error", "Generic server error"),
	"-21": e(
		"error",
		"Server error, because of database connection/operation issue",
	),
	"-22": e("error", "Server error, because of file system/network/IO issue"),
	"0": e("pending", "The expected data processing is not yet complete"),
	"-11": e(
		"error",
		"Failed import of a file, because the same file is already on the server",
	),
	"-12": e(
		"error",
		"Failed import of a file, because of failing XML validation",
	),
	"-13": e(
		"error",
		"Failed import of a file, because of [FATAL] level Schematron rule violation",
	),
	"-14": e(
		"error",
		"Failed import of a file, because of [ERROR] level Schematron rule violation",
	),
	"-15": e(
		"error",
		"Failed import of a file, because of critical ETL rule violation",
	),
	"-16": e(
		"error",
		"Failed import of a file, because of critical Business Intelligence rule violation",
	),
	"-30": e(
		"error",
		"Failed import of a file, because the size of soap message exceeds the limit",
	),
	"1": e("success", "Successful import of a file"),
	"2": e(
		"success",
		"Successful import of a file, with [ERROR] level Schematron rule violation reported",
	),
	"3": e(
		"success",
		"Successful import of a file, with [WARNING] level Schematron rule violation reported",
	),
	"4": e("success", "Successful import of a file, with ETL rule warning"),
	"5": e(
		"success",
		"Successful import of a file, with Business Intelligence warning",
	),
	"6": e(
		"partial",
		"Partially successful import of a file, with [ERROR] level Schematron rule violation reported",
	),
	"10": e(
		"pending",
		"File has passed validation, processing is not yet complete",
	),
	"-40": e(
		"error",
		"Status for the requested requestHandle is not available: it could be expired, or not in correct format, or never exist, or for any other whatever reason.",
	),
	"-41": e(
		"error",
		"Status for the requested requestHandle is not available since it expires already",
	),
	"-42": e(
		"error",
		"Invalid value of requestHandle (for example, not formatted properly)",
	),
	"-43": e("error", "Never-used value of requestHandle"),
	"51": e("success", "Successful operation of QueryLimit"),
	"-50": e("error", "Server is too busy. The client should query later"),
	"-51": e("error", "Failed operation of QueryLimit"),
};

/** Interpret a status code. Unrecognised codes (outside the custom ranges) are treated as errors. */
export function wsStatus(code: number): WsStatus {
	const known = WS_STATUS_CODES[code];
	if (known) return { code, ...known, custom: false };
	if (code > 100)
		return {
			code,
			kind: "success",
			description: "State- or vendor-specific success code",
			custom: true,
		};
	if (code < -100)
		return {
			code,
			kind: "error",
			description: "State- or vendor-specific error code",
			custom: true,
		};
	return {
		code,
		kind: "error",
		description: "Unrecognised status code",
		custom: false,
	};
}
