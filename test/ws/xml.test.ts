import { describe, expect, it } from "vitest";
import {
	elements,
	escapeAttribute,
	escapeText,
	parseXmlTree,
	serializeNode,
	textOf,
} from "../../src/ws/xml.ts";

describe("parseXmlTree", () => {
	it("builds a namespace-aware tree with text, attributes and declarations", () => {
		const root = parseXmlTree(
			`<a:r xmlns:a="urn:a" xmlns="urn:d" x="1" a:y="2">hi <b>in &amp; out</b><![CDATA[<c>]]><!-- dropped --><?pi dropped?></a:r>`,
		);
		expect(root).toMatchObject({
			name: "a:r",
			local: "r",
			uri: "urn:a",
			namespaces: { a: "urn:a", "": "urn:d" },
		});
		expect(root.attributes.map((a) => [a.name, a.uri, a.value])).toEqual([
			["x", "", "1"],
			["a:y", "urn:a", "2"],
		]);
		expect(textOf(root)).toBe("hi <c>");
		const [b] = elements(root, "b", "urn:d");
		expect(b && textOf(b)).toBe("in & out");
		expect(b?.parent).toBe(root);
		expect(elements(root, "b", "urn:other")).toEqual([]);
		expect(elements(root)).toHaveLength(1);
	});

	it("throws on malformed XML, any DOCTYPE and empty input", () => {
		expect(() => parseXmlTree("<a><b></a>")).toThrow(/line 1/);
		expect(() => parseXmlTree(`<!DOCTYPE a [<!ENTITY x "y">]><a/>`)).toThrow(
			/DOCTYPE/,
		);
		expect(() => parseXmlTree("  ")).toThrow(/root element/);
	});
});

describe("serializeNode", () => {
	it("re-serialises a subtree so it parses alone, carrying the namespaces in scope", () => {
		const root = parseXmlTree(
			`<s:E xmlns:s="urn:s" xmlns:p="urn:p" xmlns="urn:d"><s:B><p:x a="&quot;q&quot; &amp; &lt;" p:b="1">t &amp; <p:y/> &lt;u&gt;</p:x></s:B></s:E>`,
		);
		const x = elements(elements(root)[0] as never)[0];
		const out = serializeNode(x as never);
		expect(out).toBe(
			`<p:x xmlns:s="urn:s" xmlns:p="urn:p" xmlns="urn:d" a="&quot;q&quot; &amp; &lt;" p:b="1">t &amp; <p:y/> &lt;u&gt;</p:x>`,
		);
		const again = parseXmlTree(out);
		expect(again).toMatchObject({ local: "x", uri: "urn:p" });
		expect(serializeNode(again)).toBe(out);
	});

	it("a nearer declaration wins over an ancestor's", () => {
		const root = parseXmlTree(
			`<a xmlns:p="urn:1"><b xmlns:p="urn:2"><p:c/></b></a>`,
		);
		const c = elements(elements(root)[0] as never)[0];
		expect(serializeNode(c as never)).toBe(`<p:c xmlns:p="urn:2"/>`);
	});
});

describe("escaping", () => {
	it("escapes text and attributes", () => {
		expect(escapeText(`a&b<c>d\r"`)).toBe(`a&amp;b&lt;c&gt;d&#xD;"`);
		expect(escapeAttribute(`a&b<c>"\n\t\r`)).toBe(
			`a&amp;b&lt;c&gt;&quot;&#xA;&#x9;&#xD;`,
		);
	});
});
