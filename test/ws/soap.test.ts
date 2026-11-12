import { describe, expect, it } from "vitest";
import { parseSvrl } from "../../src/schematron.ts";
import {
	NemsisWsFaultError,
	NemsisWsRequestError,
	NemsisWsResponseError,
} from "../../src/ws/errors.ts";
import {
	embeddablePayload,
	parseQueryLimitResponse,
	parseRetrieveStatusResponse,
	parseSubmitDataResponse,
	queryLimitRequest,
	retrieveStatusRequest,
	soapAction,
	submitDataRequest,
	type WsCredentials,
} from "../../src/ws/soap.ts";
import { wsStatus } from "../../src/ws/status.ts";
import { parseXmlTree } from "../../src/ws/xml.ts";
import * as F from "./fixtures.ts";

const creds: WsCredentials = {
	username: "emonster",
	password: "s3cret",
	organization: "ElmoAgency",
};
const EMS = `<EMSDataSet xmlns="http://www.nemsis.org"><Header/></EMSDataSet>`;
const ENV = `<?xml version="1.0" encoding="UTF-8"?>\n<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.nemsis.org/"><soapenv:Header/><soapenv:Body>`;

describe("requests", () => {
	it("SubmitData is exactly the guide's message, with the payload embedded", () => {
		expect(
			submitDataRequest(creds, {
				xml: `<?xml version="1.0"?>\n<!-- c -->\n${EMS}\n<!-- tail -->\n`,
				schemaVersion: "3.5.1",
			}),
		).toBe(
			`${ENV}<ws:SubmitDataRequest><ws:username>emonster</ws:username><ws:password>s3cret</ws:password><ws:organization>ElmoAgency</ws:organization><ws:requestType>SubmitData</ws:requestType><ws:submitPayload><ws:payloadOfXmlElement>${EMS}</ws:payloadOfXmlElement></ws:submitPayload><ws:requestDataSchema>61</ws:requestDataSchema><ws:schemaVersion>3.5.1</ws:schemaVersion><ws:additionalInfo></ws:additionalInfo></ws:SubmitDataRequest></soapenv:Body></soapenv:Envelope>`,
		);
	});

	it("picks the data-schema code from the root element, or takes it explicitly", () => {
		const code = (xml: string, schema?: "EMSDataSet" | number) =>
			/<ws:requestDataSchema>(\d+)</.exec(
				submitDataRequest(creds, {
					xml,
					schemaVersion: "3.5.1",
					...(schema === undefined ? {} : { schema }),
				}),
			)?.[1];
		expect(code(EMS)).toBe("61");
		expect(code(`<n:DEMDataSet xmlns:n="http://www.nemsis.org"/>`)).toBe("62");
		expect(code(`<StateDataSet xmlns="http://www.nemsis.org"/>`)).toBe("65");
		expect(code(`<Other/>`, 63)).toBe("63");
		expect(code(`<Other/>`, "EMSDataSet")).toBe("61");
		expect(() => code(`<Other/>`)).toThrow(
			/Cannot tell the data schema from <Other>/,
		);
	});

	it("escapes credentials and free text, and rejects bad input without echoing the password", () => {
		const out = submitDataRequest(
			{ username: "a&b", password: "p<w>", organization: "o" },
			{ xml: EMS, schemaVersion: "3.5.1", additionalInfo: "x<y" },
		);
		expect(out).toContain(
			"<ws:username>a&amp;b</ws:username><ws:password>p&lt;w&gt;</ws:password>",
		);
		expect(out).toContain("<ws:additionalInfo>x&lt;y</ws:additionalInfo>");
		const long = "z".repeat(251);
		try {
			submitDataRequest(
				{ ...creds, password: long },
				{ xml: EMS, schemaVersion: "3.5.1" },
			);
			expect.unreachable();
		} catch (e) {
			expect(e).toBeInstanceOf(NemsisWsRequestError);
			expect((e as Error).message).toBe(
				"password must be a string of 1 to 250 characters",
			);
			expect((e as Error).message).not.toContain("zzz");
		}
		expect(() =>
			submitDataRequest(
				{ ...creds, username: "" },
				{ xml: EMS, schemaVersion: "3.5.1" },
			),
		).toThrow(/username must be/);
		expect(() =>
			submitDataRequest(
				{ ...creds, organization: "o".repeat(101) },
				{ xml: EMS, schemaVersion: "3.5.1" },
			),
		).toThrow(/organization must be/);
		expect(() =>
			submitDataRequest(creds, { xml: EMS, schemaVersion: "" }),
		).toThrow(/schemaVersion is required/);
	});

	it("rejects payloads that are not a single well-formed document without a DOCTYPE", () => {
		for (const [xml, message] of [
			["<EMSDataSet", /not well-formed/],
			[`<!DOCTYPE a [<!ENTITY x "y">]><a/>`, /DOCTYPE/],
			["", /no root element|not well-formed/],
			["<a/><b/>", /not well-formed/],
			[5 as unknown as string, /must be an XML string/],
		] as const) {
			expect(() => embeddablePayload(xml), String(xml)).toThrow(message);
		}
		expect(
			embeddablePayload(
				`﻿<?xml version="1.0"?><?pi x?><!-- a > b --><r a="1">x</r><!-- z -->`,
			),
		).toEqual({
			element: `<r a="1">x</r>`,
			root: "r",
		});
	});

	it("RetrieveStatus and QueryLimit", () => {
		expect(
			retrieveStatusRequest(creds, {
				requestHandle: "12<3",
				originalRequestType: "SubmitData",
			}),
		).toBe(
			`${ENV}<ws:RetrieveStatusRequest><ws:username>emonster</ws:username><ws:password>s3cret</ws:password><ws:organization>ElmoAgency</ws:organization><ws:requestType>RetrieveStatus</ws:requestType><ws:requestHandle>12&lt;3</ws:requestHandle><ws:originalRequestType>SubmitData</ws:originalRequestType><ws:additionalInfo></ws:additionalInfo></ws:RetrieveStatusRequest></soapenv:Body></soapenv:Envelope>`,
		);
		expect(retrieveStatusRequest(creds, { requestHandle: "1" })).not.toContain(
			"originalRequestType",
		);
		expect(() => retrieveStatusRequest(creds, { requestHandle: "" })).toThrow(
			/requestHandle must be/,
		);
		expect(queryLimitRequest(creds)).toBe(
			`${ENV}<ws:QueryLimitRequest><ws:username>emonster</ws:username><ws:password>s3cret</ws:password><ws:organization>ElmoAgency</ws:organization><ws:requestType>QueryLimit</ws:requestType></ws:QueryLimitRequest></soapenv:Body></soapenv:Envelope>`,
		);
		expect(soapAction("SubmitData")).toBe(`"http://ws.nemsis.org/SubmitData"`);
	});
});

describe("responses", () => {
	it("SubmitData success with an attached Schematron report (SVRL stays readable)", () => {
		const r = parseSubmitDataResponse(F.SYNC_OK);
		expect(r).toMatchObject({
			requestType: "SubmitData",
			requestHandle: "23456789",
			statusCode: 2,
			status: { kind: "success", custom: false },
			report: {
				xmlValidation: { totalErrorCount: 0, errors: [] },
				customReports: [],
			},
		});
		expect(r.report?.schematronReports).toHaveLength(1);
		expect(parseSvrl(r.report?.schematronReports[0] ?? "")).toMatchObject([
			{ id: "nemSch_e002", severity: "error", text: "Msg" },
		]);
	});

	it("pending responses carry no report; handles are trimmed", () => {
		const r = parseSubmitDataResponse(F.PENDING);
		expect(r).toMatchObject({
			requestHandle: "12345678",
			statusCode: 0,
			status: { kind: "pending" },
		});
		expect(r.report).toBeUndefined();
	});

	it("a rejection lists every kind of error, a server message and custom reports (prefixed namespace)", () => {
		const r = parseSubmitDataResponse(F.REJECTED);
		expect(r.status).toMatchObject({
			kind: "error",
			description: expect.stringContaining("failing XML validation"),
		});
		expect(r.report?.serverError).toBe("Disk almost full");
		expect(r.report?.xmlValidation).toEqual({
			totalErrorCount: 3,
			errors: [
				{
					description: "Value out of range",
					generalErrors: [],
					failedElements: [
						{
							elementName: "eVitals.06",
							location: {
								line: 12,
								column: 7,
								xpath: "/EMSDataSet/Header[1]/eVitals.06",
							},
							value: "ABC",
						},
						{ elementName: "eVitals.07" },
					],
				},
				{
					description: "Not XML",
					generalErrors: [
						"Content is not allowed in prolog.",
						"Second message",
					],
					failedElements: [],
				},
			],
		});
		expect(r.report?.schematronReports).toEqual([]);
		expect(r.report?.customReports).toHaveLength(1);
		const custom = r.report?.customReports[0];
		expect(custom?.reportType).toBe("ETL");
		// Declarations in scope from the envelope are carried along, so the fragment parses alone.
		const etl = parseXmlTree(custom?.payloads[0] ?? "");
		expect([etl.local, etl.uri, etl.namespaces[""]]).toEqual([
			"etl",
			"urn:example",
			"urn:example",
		]);
		expect(etl.namespaces.ws).toBe("http://ws.nemsis.org/");
	});

	it("RetrieveStatus: pending, and done with the report under retrieveResult", () => {
		expect(parseRetrieveStatusResponse(F.RETRIEVE_PENDING)).toMatchObject({
			statusCode: 10,
			status: { kind: "pending" },
		});
		const done = parseRetrieveStatusResponse(F.RETRIEVE_DONE);
		expect(done).toMatchObject({
			statusCode: 1,
			requestHandle: "12345678",
			report: { xmlValidation: { totalErrorCount: 0 } },
		});
	});

	it("QueryLimit", () => {
		expect(parseQueryLimitResponse(F.QUERY_LIMIT)).toMatchObject({
			limitKb: 5120,
			limitBytes: 5120 * 1024,
			statusCode: 51,
			status: { kind: "success" },
		});
	});

	it("SOAP faults (1.1 and 1.2) throw NemsisWsFaultError", () => {
		for (const [xml, code, text] of [
			[F.FAULT_11, "S:Server", "Internal error"],
			[F.FAULT_12, "env:Receiver", "Overloaded"],
		] as const) {
			try {
				parseSubmitDataResponse(xml);
				expect.unreachable();
			} catch (e) {
				expect(e).toBeInstanceOf(NemsisWsFaultError);
				expect(e).toMatchObject({ faultCode: code, faultString: text });
			}
		}
	});

	it("anything else malformed throws NemsisWsResponseError with a clear reason", () => {
		const wrap = (b: string) =>
			`<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body>${b}</S:Body></S:Envelope>`;
		const cases: [string, RegExp][] = [
			["<html><body>oops</body></html>", /not a SOAP envelope \(root <html>\)/],
			["<S:Envelope", /not well-formed XML/],
			[
				`<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"/>`,
				/no Body/,
			],
			[
				wrap(`<Other xmlns="http://ws.nemsis.org/"/>`),
				/no <SubmitDataResponse>/,
			],
			[
				wrap(`<SubmitDataResponse xmlns="urn:wrong"/>`),
				/no <SubmitDataResponse>/,
			],
			[
				wrap(
					`<SubmitDataResponse xmlns="http://ws.nemsis.org/"><requestType>SubmitData</requestType><statusCode>1</statusCode></SubmitDataResponse>`,
				),
				/missing <requestHandle>/,
			],
			[
				wrap(
					`<SubmitDataResponse xmlns="http://ws.nemsis.org/"><requestType>S</requestType><requestHandle>1</requestHandle><statusCode>one</statusCode></SubmitDataResponse>`,
				),
				/statusCode is not an integer: "one"/,
			],
			[
				`<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><S:Fault/></S:Body></S:Envelope>`,
				/SOAP fault unknown/,
			],
		];
		for (const [xml, message] of cases) {
			expect(() => parseSubmitDataResponse(xml), xml).toThrow(message);
		}
		expect(() =>
			parseQueryLimitResponse(
				wrap(
					`<QueryLimitResponse xmlns="http://ws.nemsis.org/"><requestType>QueryLimit</requestType><limit>1.5</limit><statusCode>51</statusCode></QueryLimitResponse>`,
				),
			),
		).toThrow(NemsisWsResponseError);
	});
});

describe("wsStatus", () => {
	it("classifies known, pending, partial, custom and unrecognised codes", () => {
		expect(wsStatus(1)).toMatchObject({
			kind: "success",
			custom: false,
			description: "Successful import of a file",
		});
		expect(wsStatus(6).kind).toBe("partial");
		expect([wsStatus(0).kind, wsStatus(10).kind]).toEqual([
			"pending",
			"pending",
		]);
		expect(wsStatus(-14).kind).toBe("error");
		expect(wsStatus(101)).toMatchObject({ kind: "success", custom: true });
		expect(wsStatus(-101)).toMatchObject({ kind: "error", custom: true });
		expect(wsStatus(7)).toMatchObject({
			kind: "error",
			custom: false,
			description: "Unrecognised status code",
		});
		expect(wsStatus(-100).kind).toBe("error");
	});
});
