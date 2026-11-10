/**
 * Flatten XML (via fast-xml-parser, independent of the saxes-based parser under test) and parsed
 * documents (via the schema model) into the same comparable entries, one per element:
 * `{ path, text, attrs, nil }` with every path segment indexed (`Header[0]/eRecord.01[0]`).
 */
import { XMLParser } from "fast-xml-parser";
import type { ElementDef, GroupElement } from "../../src/schema/types.ts";

export interface Entry {
	path: string;
	text: string;
	attrs: Record<string, string>;
	nil: boolean;
}

type Node = Record<string, unknown>;

const oracle = new XMLParser({
	preserveOrder: true,
	ignoreAttributes: false,
	attributeNamePrefix: "",
	removeNSPrefix: true,
	parseTagValue: false,
	parseAttributeValue: false,
	trimValues: false,
	htmlEntities: true,
});

const ATTRS = ":@";
const tagOf = (n: Node) => Object.keys(n).find((k) => k !== ATTRS) ?? "";

/** Entries for every element of an XML document (namespace declarations and xsi:* dropped). */
export function flattenXml(xml: string): Entry[] {
	const out: Entry[] = [];
	const visit = (n: Node, parentPath: string, index: number) => {
		const tag = tagOf(n);
		const path = `${parentPath}${parentPath ? "/" : ""}${tag}[${index}]`;
		const raw = (n[ATTRS] ?? {}) as Record<string, string>;
		const attrs: Record<string, string> = {};
		let nil = false;
		for (const [k, v] of Object.entries(raw)) {
			if (k === "xmlns" || k.startsWith("xmlns:")) continue;
			if (k === "nil") nil = v === "true" || v === "1";
			else if (k !== "schemaLocation") attrs[k] = v;
		}
		const kids = (n[tag] as Node[]) ?? [];
		const elements = kids.filter(
			(k) => !("#text" in k) && !tagOf(k).startsWith("?"),
		);
		const text = elements.length
			? ""
			: kids.map((k) => String(k["#text"] ?? "")).join("");
		out.push({ path, text, attrs, nil });
		const seen = new Map<string, number>();
		for (const k of elements) {
			const i = seen.get(tagOf(k)) ?? 0;
			seen.set(tagOf(k), i + 1);
			visit(k, path, i);
		}
	};
	const root = (oracle.parse(xml) as Node[]).find(
		(n) => !("#text" in n) && !tagOf(n).startsWith("?"),
	);
	if (root) visit(root, "", 0);
	return out;
}

/** Entries for a parsed document, using the schema model to tell elements from attributes. */
export function flattenDocument(
	doc: Record<string, unknown>,
	root: GroupElement,
): Entry[] {
	const out: Entry[] = [];
	const visit = (value: unknown, def: ElementDef, path: string) => {
		if (def.kind === "group") {
			const obj = value as Record<string, unknown>;
			const attrs = Object.fromEntries(
				def.attributes
					.filter((a) => a.name in obj)
					.map((a) => [a.name, String(obj[a.name])]),
			);
			out.push({ path, text: "", attrs, nil: false });
			for (const child of def.children) {
				const v = obj[child.name];
				if (v === undefined) continue;
				const list = Array.isArray(v) ? v : [v];
				for (const [i, item] of list.entries())
					visit(item, child, `${path}/${child.name}[${i}]`);
			}
			return;
		}
		if (typeof value === "string") {
			out.push({ path, text: value, attrs: {}, nil: false });
			return;
		}
		const {
			value: text,
			nil,
			...attrs
		} = value as { value?: string; nil?: true } & Record<string, string>;
		out.push({ path, text: text ?? "", attrs, nil: nil === true });
	};
	visit(doc, root, `${root.name}[0]`);
	return out;
}

export const byPath = (a: Entry, b: Entry): number =>
	a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
