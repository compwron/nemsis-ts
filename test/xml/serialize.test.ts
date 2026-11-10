import { describe, expect, it } from "vitest";
import { parseDocument } from "../../src/xml/parse.ts";
import {
	NemsisSerializeError,
	serializeDocument,
} from "../../src/xml/serialize.ts";
import { schema } from "../support/mini-schema.ts";

const ser = (doc: Record<string, unknown>, opts = {}) =>
	serializeDocument("EMSDataSet", doc, schema, opts);

describe("serializeDocument", () => {
	it("writes elements in schema order, attributes, nils and arrays", () => {
		const xml = ser({
			Header: [
				{
					"eVitals.VitalGroup": [
						{
							"eVitals.08": { value: "x", CorrelationID: "c" },
							"eVitals.07": ["a", "b"],
							"eVitals.06": { nil: true, NV: "7701003" },
							CorrelationID: "v1",
						},
					],
					"eRecord.01": "R1",
					UUID: "u-1",
				},
			],
		});
		expect(xml).toBe(
			[
				`<?xml version="1.0" encoding="UTF-8"?>`,
				`<EMSDataSet xmlns="http://www.nemsis.org" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
				`    <Header UUID="u-1">`,
				`        <eRecord.01>R1</eRecord.01>`,
				`        <eVitals.VitalGroup CorrelationID="v1">`,
				`            <eVitals.06 xsi:nil="true" NV="7701003"/>`,
				`            <eVitals.07>a</eVitals.07>`,
				`            <eVitals.07>b</eVitals.07>`,
				`            <eVitals.08 CorrelationID="c">x</eVitals.08>`,
				`        </eVitals.VitalGroup>`,
				`    </Header>`,
				`</EMSDataSet>`,
				``,
			].join("\n"),
		);
	});

	it("declares xsi only when needed; empty groups self-close; options", () => {
		expect(
			ser({ Header: [{ UUID: "u" }] }, { indent: false, declaration: false }),
		).toBe(
			`<EMSDataSet xmlns="http://www.nemsis.org"><Header UUID="u"/></EMSDataSet>\n`,
		);
		expect(
			ser(
				{},
				{ indent: "\t", schemaLocation: `http://www.nemsis.org a"b.xsd` },
			),
		).toBe(
			`<?xml version="1.0" encoding="UTF-8"?>\n<EMSDataSet xmlns="http://www.nemsis.org" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.nemsis.org a&quot;b.xsd"/>\n`,
		);
	});

	it("escapes text and attributes so values round-trip exactly", () => {
		const text = `  a & b < c > d ]]> \r\n "q" 'q' ’ 😀 `;
		const attr = `x & < > " ' \t\n\r y`;
		const doc = {
			Header: [
				{
					UUID: attr,
					"eRecord.01": text,
					"eVitals.VitalGroup": [{ "eVitals.06": { value: "" } }],
				},
			],
		};
		const xml = ser(doc);
		expect(xml).toContain("&amp; b &lt; c &gt; d ]]&gt; &#xD;\n");
		expect(parseDocument(xml, schema).document).toEqual(doc);
		expect(parseDocument(xml, schema).issues).toEqual([]);
	});

	describe("rejects shapes the schema cannot hold (no silent data loss)", () => {
		const bad = (
			doc: Record<string, unknown>,
			message: RegExp,
			path: string,
		) => {
			expect(() => ser(doc)).toThrow(message);
			try {
				ser(doc);
			} catch (e) {
				expect(e).toBeInstanceOf(NemsisSerializeError);
				expect((e as NemsisSerializeError).path).toBe(path);
			}
		};
		const vg = (v: unknown) => ({
			Header: [{ UUID: "u", "eRecord.01": "R", "eVitals.VitalGroup": [v] }],
		});

		it("unknown keys", () => {
			bad(
				{ Header: [{ eBogus: "x" }] },
				/no element or attribute "eBogus"/,
				"EMSDataSet/Header[0]",
			);
			bad(
				vg({ "eVitals.06": { value: "1", PN: "8801019", XX: "1" } }),
				/no attribute or property "XX"/,
				"EMSDataSet/Header[0]/eVitals.VitalGroup[0]/eVitals.06",
			);
		});

		it("arrays vs single occurrences", () => {
			bad(
				{ Header: { UUID: "u" } },
				/repeats, so it must be an array/,
				"EMSDataSet/Header",
			);
			bad(
				{ Header: [{ "eRecord.01": ["a"] }] },
				/at most once/,
				"EMSDataSet/Header[0]/eRecord.01",
			);
		});

		it("wrong value types", () => {
			bad(
				{ Header: [1] },
				/<Header> must be an object/,
				"EMSDataSet/Header[0]",
			);
			bad(
				{ Header: [{ "eRecord.01": 5 }] },
				/Value must be a string, got number/,
				"EMSDataSet/Header[0]/eRecord.01",
			);
			bad(
				{ Header: [{ UUID: 5 }] },
				/Attribute value must be a string/,
				"EMSDataSet/Header[0]/@UUID",
			);
			bad(
				vg({ "eVitals.06": "120" }),
				/must be \{ value \} or \{ nil: true \}/,
				"EMSDataSet/Header[0]/eVitals.VitalGroup[0]/eVitals.06",
			);
			bad(
				vg({ "eVitals.06": {} }),
				/Value must be a string, got undefined/,
				"EMSDataSet/Header[0]/eVitals.VitalGroup[0]/eVitals.06",
			);
		});

		it("inconsistent nil", () => {
			bad(
				vg({ "eVitals.06": { nil: true, value: "1" } }),
				/both nil and a value/,
				"EMSDataSet/Header[0]/eVitals.VitalGroup[0]/eVitals.06",
			);
			bad(
				vg({ "eVitals.06": { nil: false, value: "1" } }),
				/nil must be true/,
				"EMSDataSet/Header[0]/eVitals.VitalGroup[0]/eVitals.06",
			);
			bad(
				vg({ "eVitals.08": { nil: true } }),
				/is not nillable/,
				"EMSDataSet/Header[0]/eVitals.VitalGroup[0]/eVitals.08",
			);
		});

		it("characters XML 1.0 cannot represent", () => {
			for (const s of [
				"a\u0000",
				"\u0001",
				"\u000B",
				String.fromCharCode(0xfffe),
				"\uD800",
				"\uDC00x",
				"\uD800x",
			]) {
				bad(
					{ Header: [{ "eRecord.01": s }] },
					/character XML cannot represent/,
					"EMSDataSet/Header[0]/eRecord.01",
				);
			}
			expect(() =>
				ser({
					Header: [{ "eRecord.01": `\t\n\r 😀${String.fromCharCode(0xfffd)}` }],
				}),
			).not.toThrow();
		});

		it("an unknown dataset", () => {
			expect(() =>
				serializeDocument("Nope" as "EMSDataSet", {}, schema),
			).toThrow(/Unknown dataset Nope/);
		});
	});
});
