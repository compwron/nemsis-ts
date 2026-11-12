/**
 * The web-service client against NEMSIS's own WSDL (`WSDL/NEMSIS_V3_core.wsdl`): our status-code
 * table must equal the WSDL's enumerations word for word, and every message we build or parse
 * must validate against the XML Schema embedded in the WSDL.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateXML } from "xmllint-wasm";
import { SUPPORTED_VERSIONS } from "../../src/index.ts";
import {
	DATA_SCHEMA,
	queryLimitRequest,
	retrieveStatusRequest,
	submitDataRequest,
	type WsCredentials,
} from "../../src/ws/soap.ts";
import { WS_STATUS_CODES } from "../../src/ws/status.ts";
import {
	elements,
	parseXmlTree,
	serializeNode,
	textOf,
	type XmlNode,
} from "../../src/ws/xml.ts";
import { specRoot } from "../support/spec.ts";
import * as F from "../ws/fixtures.ts";

const XS = "http://www.w3.org/2001/XMLSchema";
const creds: WsCredentials = {
	username: "emonster",
	password: "ABC123",
	organization: "ElmoAgency",
};

/** The WSDL's `xsd:schema`, as a standalone schema document. */
function wsdlSchema(wsdl: string): string {
	const m = /<xsd:schema\b[\s\S]*?<\/xsd:schema>/.exec(wsdl);
	if (!m) throw new Error("no schema in the WSDL");
	return m[0].replace("<xsd:schema ", `<xsd:schema xmlns:xsd="${XS}" `);
}

/** Enumerated integers with their documentation, from the WSDL's named simple types matching `include`. */
function enumerations(
	wsdl: string,
	include: (typeName: string) => boolean,
): Map<number, string> {
	const out = new Map<number, string>();
	const walk = (n: XmlNode) => {
		const typeName =
			n.local === "simpleType"
				? n.attributes.find((a) => a.name === "name")?.value
				: undefined;
		if (typeName !== undefined && include(typeName)) {
			const collect = (m: XmlNode) => {
				for (const e of elements(m, "enumeration", XS)) {
					const doc = elements(e, "annotation", XS)[0];
					const text = doc
						? textOf(elements(doc, "documentation", XS)[0] as XmlNode)
						: "";
					out.set(
						Number(e.attributes.find((a) => a.name === "value")?.value),
						text.replace(/\s+/g, " ").trim(),
					);
				}
				for (const c of elements(m)) collect(c);
			};
			collect(n);
			return;
		}
		for (const c of elements(n)) walk(c);
	};
	walk(parseXmlTree(wsdlSchema(wsdl)));
	return out;
}

/** The operation element inside a SOAP envelope, standalone, for schema validation. */
const bodyElement = (soap: string): string => {
	const body = elements(parseXmlTree(soap), "Body")[0] as XmlNode;
	return serializeNode(elements(body)[0] as XmlNode);
};

for (const version of SUPPORTED_VERSIONS) {
	const root = specRoot(version);
	describe.skipIf(!root)(`web services vs the WSDL (${version})`, () => {
		const base = root ?? "";
		const wsdl = readFileSync(
			join(base, "WSDL", "NEMSIS_V3_core.wsdl"),
			"utf8",
		);
		const schema = { fileName: "ws.xsd", contents: wsdlSchema(wsdl) };
		const valid = async (xml: string) => {
			const result = await validateXML({
				xml: { fileName: "m.xml", contents: xml },
				schema,
			});
			return result.errors.map((e) => e.message.trim());
		};

		it("the status-code table equals the WSDL's enumerations, descriptions included", () => {
			const fromWsdl = enumerations(
				wsdl,
				(name) => name !== "NemsisDataSchema",
			);
			expect(fromWsdl.size).toBe(Object.keys(WS_STATUS_CODES).length);
			expect(Object.fromEntries(fromWsdl)).toEqual(
				Object.fromEntries(
					Object.entries(WS_STATUS_CODES).map(([code, e]) => [
						code,
						e.description,
					]),
				),
			);
		});

		it("the data-schema codes we send are the WSDL's own", () => {
			const codes = enumerations(wsdl, (name) => name === "NemsisDataSchema");
			expect([...codes.keys()]).toEqual([61, 62, 63, 64, 65]);
			expect(codes.get(DATA_SCHEMA.EMSDataSet)).toBe("NEMSIS EMS Schema");
			expect(codes.get(DATA_SCHEMA.DEMDataSet)).toBe(
				"NEMSIS Demographics Schema",
			);
			expect(codes.get(DATA_SCHEMA.StateDataSet)).toBe(
				"NEMSIS State Data Set Schema",
			);
		});

		it("the WSDL declares the three operations, SOAP 1.1 document/literal, and the actions we send", () => {
			expect(wsdl).toContain('<soap:binding style="document"');
			for (const op of ["SubmitData", "RetrieveStatus", "QueryLimit"]) {
				expect(wsdl).toContain(`soapAction="http://ws.nemsis.org/${op}"`);
			}
			expect(wsdl).toContain('targetNamespace="http://ws.nemsis.org/"');
		});

		it("requests validate against the WSDL schema, carrying every compliance document", async () => {
			const compliance = join(
				base,
				"Compliance",
				"Pre-Testing",
				"xml",
				"national",
			);
			const files = readdirSync(compliance).filter((f) => f.endsWith(".xml"));
			expect(files.length).toBeGreaterThan(5);
			for (const file of files) {
				const xml = readFileSync(join(compliance, file), "utf8");
				const message = submitDataRequest(creds, {
					xml,
					schemaVersion: "3.5.1",
					additionalInfo: "note",
				});
				expect(await valid(bodyElement(message)), file).toEqual([]);
			}
			expect(
				await valid(
					bodyElement(
						retrieveStatusRequest(creds, {
							requestHandle: "12345678",
							originalRequestType: "SubmitData",
						}),
					),
				),
			).toEqual([]);
			expect(
				await valid(
					bodyElement(retrieveStatusRequest(creds, { requestHandle: "1" })),
				),
			).toEqual([]);
			expect(await valid(bodyElement(queryLimitRequest(creds)))).toEqual([]);
		}, 120_000);

		it("the schema really rejects bad messages (so the checks above mean something)", async () => {
			const good = bodyElement(queryLimitRequest(creds));
			expect(
				await valid(
					good.replace("<ws:requestType>QueryLimit", "<ws:requestType>Nope"),
				),
			).not.toEqual([]);
			expect(
				await valid(good.replace(/<ws:organization>.*<\/ws:organization>/, "")),
			).not.toEqual([]);
		});

		it("our response fixtures are valid WSDL messages, so the parser is exercised on realistic input", async () => {
			for (const [name, soap] of Object.entries({
				SYNC_OK: F.SYNC_OK,
				PENDING: F.PENDING,
				RETRIEVE_PENDING: F.RETRIEVE_PENDING,
				RETRIEVE_DONE: F.RETRIEVE_DONE,
				REJECTED: F.REJECTED,
				QUERY_LIMIT: F.QUERY_LIMIT,
			})) {
				expect(await valid(bodyElement(soap)), name).toEqual([]);
			}
		});
	});
}
