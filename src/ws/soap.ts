/**
 * Build and read NEMSIS web-service SOAP 1.1 messages (document/literal, namespace
 * `http://ws.nemsis.org/`, as defined by `NEMSIS_V3_core.wsdl`).
 */
import { SaxesParser } from "saxes";
import {
	NemsisWsFaultError,
	NemsisWsRequestError,
	NemsisWsResponseError,
} from "./errors.ts";
import { type WsStatus, wsStatus } from "./status.ts";
import {
	elements,
	escapeText,
	parseXmlTree,
	serializeNode,
	textOf,
	type XmlNode,
} from "./xml.ts";

export const WS_NS = "http://ws.nemsis.org/";
const SOAP11_NS = "http://schemas.xmlsoap.org/soap/envelope/";
const SOAP12_NS = "http://www.w3.org/2003/05/soap-envelope";

export type WsOperation = "SubmitData" | "RetrieveStatus" | "QueryLimit";

/** The `SOAPAction` header value for an operation. */
export const soapAction = (operation: WsOperation): string =>
	`"${WS_NS}${operation}"`;

/** `requestDataSchema` codes from the WSDL. */
export const DATA_SCHEMA = {
	EMSDataSet: 61,
	DEMDataSet: 62,
	StateDataSet: 65,
} as const;
export type WsDataSchemaName = keyof typeof DATA_SCHEMA;

export interface WsCredentials {
	readonly username: string;
	readonly password: string;
	readonly organization: string;
}

const LIMITS = [
	["username", 100],
	["password", 250],
	["organization", 100],
] as const;

const req = (message: string): never => {
	throw new NemsisWsRequestError(message);
};

function credentialsXml(c: WsCredentials): string {
	let out = "";
	for (const [field, max] of LIMITS) {
		const value = c[field];
		if (typeof value !== "string" || value.length < 1 || value.length > max) {
			// Never echo the value: it may be a password.
			req(`${field} must be a string of 1 to ${max} characters`);
		}
		out += `<ws:${field}>${escapeText(value)}</ws:${field}>`;
	}
	return out;
}

const envelope = (body: string): string =>
	`<?xml version="1.0" encoding="UTF-8"?>\n<soapenv:Envelope xmlns:soapenv="${SOAP11_NS}" xmlns:ws="${WS_NS}"><soapenv:Header/><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`;

/**
 * The root element of an XML document, ready to embed in a SOAP body: prolog (XML declaration,
 * comments, processing instructions) and anything after the root are dropped. Returns the dataset
 * name. Throws `NemsisWsRequestError` for malformed XML or a DOCTYPE.
 */
export function embeddablePayload(xml: string): {
	element: string;
	root: string;
} {
	if (typeof xml !== "string") req("The payload must be an XML string");
	const parser = new SaxesParser({ position: true });
	let depth = 0;
	let root = "";
	let end = -1;
	parser.on("error", (e) =>
		req(`The payload is not well-formed XML: ${e.message}`),
	);
	parser.on("doctype", () => req("The payload must not contain a DOCTYPE"));
	parser.on("opentag", (tag) => {
		if (depth === 0) root = tag.name;
		depth++;
	});
	parser.on("closetag", () => {
		depth--;
		if (depth === 0) end = parser.position;
	});
	parser.write(xml).close();
	if (end < 0) req("The payload has no root element");
	// Skip the prolog by hand to find where the root element starts.
	let start = 0;
	for (;;) {
		const rest = xml.slice(start);
		const lead = /^(?:﻿|\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->)/.exec(rest);
		if (!lead) break;
		start += lead[0].length;
	}
	return {
		element: xml.slice(start, end),
		root: root.slice(root.indexOf(":") + 1),
	};
}

export interface SubmitDataRequestInput {
	/** The NEMSIS document (EMSDataSet, DEMDataSet or StateDataSet) as XML text. */
	readonly xml: string;
	/** Defaults to the code matching the document's root element. */
	readonly schema?: WsDataSchemaName | number;
	/** The NEMSIS schema version the data conforms to, e.g. `3.5.1`. */
	readonly schemaVersion: string;
	readonly additionalInfo?: string;
}

export function submitDataRequest(
	credentials: WsCredentials,
	input: SubmitDataRequestInput,
): string {
	const payload = embeddablePayload(input.xml);
	const schema =
		typeof input.schema === "number"
			? input.schema
			: DATA_SCHEMA[(input.schema ?? payload.root) as WsDataSchemaName];
	if (schema === undefined || !Number.isInteger(schema)) {
		req(
			`Cannot tell the data schema from <${payload.root}>; pass schema (${Object.keys(DATA_SCHEMA).join(", ")} or a number)`,
		);
	}
	if (typeof input.schemaVersion !== "string" || input.schemaVersion === "")
		req("schemaVersion is required, e.g. 3.5.1");
	return envelope(
		`<ws:SubmitDataRequest>${credentialsXml(credentials)}<ws:requestType>SubmitData</ws:requestType><ws:submitPayload><ws:payloadOfXmlElement>${payload.element}</ws:payloadOfXmlElement></ws:submitPayload><ws:requestDataSchema>${schema}</ws:requestDataSchema><ws:schemaVersion>${escapeText(input.schemaVersion)}</ws:schemaVersion><ws:additionalInfo>${escapeText(input.additionalInfo ?? "")}</ws:additionalInfo></ws:SubmitDataRequest>`,
	);
}

export interface RetrieveStatusRequestInput {
	readonly requestHandle: string;
	/** `SubmitData` for a submission; optional per the WSDL. */
	readonly originalRequestType?: string;
	readonly additionalInfo?: string;
}

export function retrieveStatusRequest(
	credentials: WsCredentials,
	input: RetrieveStatusRequestInput,
): string {
	if (typeof input.requestHandle !== "string" || input.requestHandle === "")
		req("requestHandle must be a non-empty string");
	return envelope(
		`<ws:RetrieveStatusRequest>${credentialsXml(credentials)}<ws:requestType>RetrieveStatus</ws:requestType><ws:requestHandle>${escapeText(input.requestHandle)}</ws:requestHandle>${input.originalRequestType === undefined ? "" : `<ws:originalRequestType>${escapeText(input.originalRequestType)}</ws:originalRequestType>`}<ws:additionalInfo>${escapeText(input.additionalInfo ?? "")}</ws:additionalInfo></ws:RetrieveStatusRequest>`,
	);
}

export function queryLimitRequest(credentials: WsCredentials): string {
	return envelope(
		`<ws:QueryLimitRequest>${credentialsXml(credentials)}<ws:requestType>QueryLimit</ws:requestType></ws:QueryLimitRequest>`,
	);
}

// ---- responses ----

export interface WsXmlElementInfo {
	readonly elementName: string;
	/** Present when the server reports where the element is. */
	readonly location?: {
		readonly line?: number;
		readonly column?: number;
		readonly xpath?: string;
	};
	readonly value?: string;
}

export interface WsXmlValidationError {
	readonly description: string;
	/** Messages not tied to an element (for example a file that is not XML). */
	readonly generalErrors: readonly string[];
	/** Offending elements. */
	readonly failedElements: readonly WsXmlElementInfo[];
}

export interface WsCustomReport {
	readonly reportType: string;
	/** Embedded XML documents, serialised. */
	readonly payloads: readonly string[];
}

export interface WsSubmitReport {
	readonly serverError?: string;
	readonly xmlValidation?: {
		readonly totalErrorCount: number;
		readonly errors: readonly WsXmlValidationError[];
	};
	/** Full Schematron reports (SVRL), serialised; read them with `parseSvrl` from `nemsis-ts/schematron`. */
	readonly schematronReports: readonly string[];
	readonly customReports: readonly WsCustomReport[];
}

export interface WsResult {
	readonly requestType: string;
	readonly requestHandle: string;
	readonly statusCode: number;
	readonly status: WsStatus;
	/** Present when the server finished processing and returned its report. */
	readonly report?: WsSubmitReport;
}

export interface WsQueryLimitResult {
	/** The data-payload size limit in KB (1024 bytes); negative on error. */
	readonly limitKb: number;
	readonly limitBytes: number;
	readonly statusCode: number;
	readonly status: WsStatus;
}

const bad = (message: string): never => {
	throw new NemsisWsResponseError(message);
};

const child = (n: XmlNode, local: string): XmlNode | undefined =>
	elements(n, local, WS_NS)[0];

/** Elements named `local` inside the child `via` of `n`; none when `via` is absent. */
const through = (n: XmlNode, via: string, local: string): XmlNode[] => {
	const middle = child(n, via);
	return middle ? elements(middle, local, WS_NS) : [];
};

function requiredText(n: XmlNode, local: string): string {
	const c = child(n, local);
	return c ? textOf(c) : bad(`Response <${n.local}> is missing <${local}>`);
}

function integer(value: string, what: string): number {
	if (!/^[+-]?\d+$/.test(value))
		bad(`${what} is not an integer: ${JSON.stringify(value.slice(0, 40))}`);
	return Number(value);
}

function readFault(body: XmlNode): NemsisWsFaultError | undefined {
	const fault = elements(body).find(
		(n) => n.local === "Fault" && (n.uri === SOAP11_NS || n.uri === SOAP12_NS),
	);
	if (!fault) return undefined;
	if (fault.uri === SOAP11_NS) {
		const code = elements(fault, "faultcode")[0];
		const text = elements(fault, "faultstring")[0];
		return new NemsisWsFaultError(
			code ? textOf(code) : "unknown",
			text ? textOf(text) : "",
		);
	}
	const code = elements(fault, "Code")[0];
	const value = code ? elements(code, "Value")[0] : undefined;
	const reason = elements(fault, "Reason")[0];
	const text = reason ? elements(reason, "Text")[0] : undefined;
	return new NemsisWsFaultError(
		value ? textOf(value) : "unknown",
		text ? textOf(text) : "",
	);
}

/** The operation response element inside a SOAP envelope. Throws `NemsisWsFaultError` for a fault. */
function responseElement(xml: string, expected: string): XmlNode {
	let envelopeNode: XmlNode;
	try {
		envelopeNode = parseXmlTree(xml);
	} catch (e) {
		return bad(`The response is not well-formed XML: ${(e as Error).message}`);
	}
	if (
		envelopeNode.local !== "Envelope" ||
		(envelopeNode.uri !== SOAP11_NS && envelopeNode.uri !== SOAP12_NS)
	)
		bad(`The response is not a SOAP envelope (root <${envelopeNode.name}>)`);
	const body = elements(envelopeNode, "Body", envelopeNode.uri)[0];
	if (!body) bad("The SOAP envelope has no Body");
	const fault = readFault(body as XmlNode);
	if (fault) throw fault;
	const response = elements(body as XmlNode, expected, WS_NS)[0];
	return response ?? bad(`The SOAP body has no <${expected}> in ${WS_NS}`);
}

function parseReport(node: XmlNode): WsSubmitReport {
	const serverErr = child(node, "serverErrorReport");
	const validation = child(node, "xmlValidationErrorReport");
	const payloads = (container: XmlNode): string[] =>
		elements(container, "payloadOfXmlElement", WS_NS).flatMap((p) =>
			elements(p).map(serializeNode),
		);
	return {
		...(serverErr
			? { serverError: requiredText(serverErr, "serverErrorMessage") }
			: {}),
		...(validation
			? {
					xmlValidation: {
						totalErrorCount: integer(
							requiredText(validation, "totalErrorCount"),
							"totalErrorCount",
						),
						errors: elements(validation, "xmlError", WS_NS).map(
							(err): WsXmlValidationError => ({
								description: requiredText(err, "desc"),
								generalErrors: through(
									err,
									"xmlGeneralErrorList",
									"errorMessage",
								).map(textOf),
								failedElements: through(
									err,
									"failedElementList",
									"xmlElementInfo",
								).map((info): WsXmlElementInfo => {
									const loc = child(info, "elementLocation");
									const value = child(info, "value");
									const num = (n: XmlNode, l: string) => {
										const c = child(n, l);
										return c ? integer(textOf(c), l) : undefined;
									};
									const line = loc ? num(loc, "line") : undefined;
									const column = loc ? num(loc, "column") : undefined;
									const xpathNode = loc
										? child(loc, "xpathLocation")
										: undefined;
									return {
										elementName: requiredText(info, "elementName"),
										...(loc
											? {
													location: {
														...(line === undefined ? {} : { line }),
														...(column === undefined ? {} : { column }),
														...(xpathNode ? { xpath: textOf(xpathNode) } : {}),
													},
												}
											: {}),
										...(value ? { value: textOf(value) } : {}),
									};
								}),
							}),
						),
					},
				}
			: {}),
		schematronReports: through(
			node,
			"schematronReport",
			"completeSchematronReport",
		).flatMap((c) => elements(c, "completeReport", WS_NS).flatMap(payloads)),
		customReports: elements(node, "customReport", WS_NS).map(
			(c): WsCustomReport => ({
				reportType: requiredText(c, "reportType"),
				payloads: elements(c, "customReport", WS_NS).flatMap(payloads),
			}),
		),
	};
}

function result(response: XmlNode, report: XmlNode | undefined): WsResult {
	const statusCode = integer(
		requiredText(response, "statusCode"),
		"statusCode",
	);
	return {
		requestType: requiredText(response, "requestType"),
		requestHandle: requiredText(response, "requestHandle"),
		statusCode,
		status: wsStatus(statusCode),
		...(report ? { report: parseReport(report) } : {}),
	};
}

/** Read a `SubmitDataResponse` SOAP message. */
export function parseSubmitDataResponse(xml: string): WsResult {
	const response = responseElement(xml, "SubmitDataResponse");
	return result(response, child(response, "reports"));
}

/** Read a `RetrieveStatusResponse` SOAP message. */
export function parseRetrieveStatusResponse(xml: string): WsResult {
	const response = responseElement(xml, "RetrieveStatusResponse");
	const retrieved = child(response, "retrieveResult");
	return result(
		response,
		retrieved ? child(retrieved, "retrieveSubmitStatus") : undefined,
	);
}

/** Read a `QueryLimitResponse` SOAP message. */
export function parseQueryLimitResponse(xml: string): WsQueryLimitResult {
	const response = responseElement(xml, "QueryLimitResponse");
	const limitKb = integer(requiredText(response, "limit"), "limit");
	const statusCode = integer(
		requiredText(response, "statusCode"),
		"statusCode",
	);
	return {
		limitKb,
		limitBytes: limitKb * 1024,
		statusCode,
		status: wsStatus(statusCode),
	};
}
