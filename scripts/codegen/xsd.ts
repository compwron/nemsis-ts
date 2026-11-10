/**
 * Read a NEMSIS dataset XSD (following `xs:include`s) into the model in `src/schema/types.ts`.
 *
 * Deliberately supports only the XSD subset NEMSIS uses, and throws on anything else, so a
 * future NEMSIS release that adopts a new construct fails codegen loudly instead of silently.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import type {
	AttributeDef,
	ElementDef,
	ElementDoc,
	EnumValue,
	Facets,
	GroupElement,
	SimpleType,
	Usage,
} from "../../src/schema/types.ts";

type Node = Record<string, unknown>;

const parser = new XMLParser({
	preserveOrder: true,
	ignoreAttributes: false,
	attributeNamePrefix: "",
	parseTagValue: false,
	parseAttributeValue: false,
	trimValues: true,
});

const ATTRS = ":@";
const TEXT = "#text";

function tagOf(n: Node): string {
	const tag = Object.keys(n).find((k) => k !== ATTRS);
	if (tag === undefined) throw new Error("Node without a tag");
	return tag;
}
function kids(n: Node): Node[] {
	const v = n[tagOf(n)];
	return Array.isArray(v) ? (v as Node[]) : [];
}
function attr(n: Node, name: string): string | undefined {
	return (n[ATTRS] as Record<string, string> | undefined)?.[name];
}
function text(n: Node): string {
	if (TEXT in n) return String(n[TEXT]);
	return kids(n).map(text).join("");
}
function elements(n: Node): Node[] {
	return kids(n).filter((c) => tagOf(c) !== TEXT && !tagOf(c).startsWith("?"));
}
function only(n: Node, tag: string): Node | undefined {
	const found = elements(n).filter((c) => tagOf(c) === tag);
	if (found.length > 1)
		throw new Error(
			`Expected at most one <${tag}> in <${tagOf(n)} name="${attr(n, "name")}">`,
		);
	return found[0];
}

class Unsupported extends Error {
	constructor(tag: string, where: string) {
		super(`Unsupported XSD construct <${tag}> in ${where}`);
	}
}

function expectTags(n: Node, allowed: readonly string[], where: string): void {
	for (const c of elements(n))
		if (!allowed.includes(tagOf(c))) throw new Unsupported(tagOf(c), where);
}

interface Loaded {
	simpleTypes: Map<string, Node>;
	complexTypes: Map<string, Node>;
	elements: Map<string, Node>;
}

function load(path: string, into: Loaded, seen: Set<string>): void {
	const abs = resolve(path);
	if (seen.has(abs)) return;
	seen.add(abs);
	const doc = parser.parse(readFileSync(abs, "utf8")) as Node[];
	const schema = doc.find((n) => tagOf(n) === "xs:schema");
	if (!schema) throw new Error(`${abs}: no <xs:schema>`);
	for (const n of elements(schema)) {
		const name = attr(n, "name") ?? "";
		switch (tagOf(n)) {
			case "xs:include":
				load(
					resolve(dirname(abs), attr(n, "schemaLocation") ?? ""),
					into,
					seen,
				);
				break;
			case "xs:simpleType":
				into.simpleTypes.set(name, n);
				break;
			case "xs:complexType":
				into.complexTypes.set(name, n);
				break;
			case "xs:element":
				into.elements.set(name, n);
				break;
			case "xs:annotation":
				break;
			default:
				throw new Unsupported(tagOf(n), abs);
		}
	}
}

const NUMERIC_FACETS = new Set([
	"minLength",
	"maxLength",
	"length",
	"totalDigits",
	"fractionDigits",
]);
const STRING_FACETS = new Set([
	"minInclusive",
	"maxInclusive",
	"minExclusive",
	"maxExclusive",
]);

function readSimpleType(name: string, n: Node): SimpleType {
	expectTags(n, ["xs:annotation", "xs:restriction"], `simpleType ${name}`);
	const r = only(n, "xs:restriction");
	if (!r)
		throw new Error(`simpleType ${name}: only xs:restriction is supported`);
	const facets: Record<string, unknown> = {};
	const enumeration: EnumValue[] = [];
	const patterns: string[] = [];
	for (const f of elements(r)) {
		const tag = tagOf(f).replace(/^xs:/, "");
		const value = attr(f, "value") ?? "";
		if (tag === "enumeration") {
			const description = text(only(f, "xs:annotation") ?? { x: [] }).trim();
			enumeration.push(description ? { value, description } : { value });
		} else if (tag === "pattern") patterns.push(value);
		else if (NUMERIC_FACETS.has(tag)) facets[tag] = Number(value);
		else if (STRING_FACETS.has(tag)) facets[tag] = value;
		else if (tag !== "annotation")
			throw new Unsupported(tagOf(f), `simpleType ${name}`);
	}
	if (patterns.length) facets.pattern = patterns;
	return {
		name,
		base: attr(r, "base") ?? "",
		facets: facets as Facets,
		...(enumeration.length ? { enumeration } : {}),
	};
}

const USAGES: readonly Usage[] = [
	"Mandatory",
	"Required",
	"Recommended",
	"Optional",
];

function readDoc(el: Node, where: string): ElementDoc | undefined {
	const tac = elements(only(el, "xs:annotation") ?? { x: [] })
		.flatMap((d) => elements(d))
		.find((d) => tagOf(d) === "nemsisTacDoc");
	if (!tac) return undefined;
	const field = (tag: string) => {
		const f = elements(tac).find((c) => tagOf(c) === tag);
		return f === undefined ? undefined : text(f).trim();
	};
	const yes = (tag: string, required = false): boolean => {
		const v = field(tag);
		if (v === undefined && !required) return false;
		if (v !== "Yes" && v !== "No")
			throw new Error(`${where}: <${tag}> is ${JSON.stringify(v)}`);
		return v === "Yes";
	};
	const usage = field("usage") as Usage;
	if (!USAGES.includes(usage))
		throw new Error(`${where}: unknown usage ${JSON.stringify(usage)}`);
	const measures = elements(tac)
		.filter((c) => tagOf(c) === "performanceMeasuresGroup")
		.flatMap((g) => elements(g).map((m) => text(m).trim()));
	const v2Number = field("v2Number");
	return {
		number: field("number") ?? "",
		name: field("name") ?? "",
		national: yes("national", true),
		state: yes("state", true),
		usage,
		definition: field("definition") ?? "",
		...(v2Number ? { v2Number } : {}),
		...(yes("PNNil") ? { pnNil: true as const } : {}),
		...(yes("deprecated") ? { deprecated: true as const } : {}),
		...(measures.length ? { performanceMeasures: measures } : {}),
	};
}

function readAttribute(a: Node, where: string): AttributeDef {
	const name = attr(a, "name") ?? "";
	const required = attr(a, "use") === "required";
	const type = attr(a, "type");
	if (type) return { name, required, type };
	const st = only(a, "xs:simpleType");
	const union = st && only(st, "xs:union");
	if (!union)
		throw new Error(`${where}@${name}: attribute needs type= or an xs:union`);
	return {
		name,
		required,
		union: (attr(union, "memberTypes") ?? "").split(/\s+/).filter(Boolean),
	};
}

export interface ReadResult {
	root: GroupElement;
	simpleTypes: Record<string, SimpleType>;
}

export function readSchema(entryPath: string, rootElement: string): ReadResult {
	const loaded: Loaded = {
		simpleTypes: new Map(),
		complexTypes: new Map(),
		elements: new Map(),
	};
	load(entryPath, loaded, new Set());

	function readComplex(
		ct: Node,
		base: Omit<GroupElement, "kind" | "children" | "attributes">,
		where: string,
	): ElementDef {
		expectTags(
			ct,
			["xs:annotation", "xs:sequence", "xs:simpleContent", "xs:attribute"],
			where,
		);
		const attributes = elements(ct)
			.filter((c) => tagOf(c) === "xs:attribute")
			.map((a) => readAttribute(a, where));
		const seq = only(ct, "xs:sequence");
		if (seq) {
			expectTags(seq, ["xs:annotation", "xs:element"], where);
			const children = elements(seq).filter((c) => tagOf(c) === "xs:element");
			return {
				kind: "group",
				...base,
				attributes,
				children: children.map(readElement),
			};
		}
		const sc = only(ct, "xs:simpleContent");
		const ext = sc && only(sc, "xs:extension");
		if (!sc || !ext)
			throw new Error(
				`${where}: complexType needs xs:sequence or xs:simpleContent/xs:extension`,
			);
		expectTags(sc, ["xs:annotation", "xs:extension"], where);
		expectTags(ext, ["xs:annotation", "xs:attribute"], where);
		return {
			kind: "leaf",
			...base,
			nillable: false,
			type: attr(ext, "base") ?? "",
			attributes: elements(ext)
				.filter((c) => tagOf(c) === "xs:attribute")
				.map((a) => readAttribute(a, where)),
		};
	}

	function readElement(el: Node): ElementDef {
		const name = attr(el, "name") ?? "";
		expectTags(el, ["xs:annotation", "xs:complexType"], `element ${name}`);
		const max = attr(el, "maxOccurs") ?? "1";
		const doc = readDoc(el, name);
		const base = {
			name,
			minOccurs: Number(attr(el, "minOccurs") ?? "1"),
			maxOccurs: max === "unbounded" ? ("unbounded" as const) : Number(max),
			...(doc ? { doc } : {}),
		};
		const nillable = attr(el, "nillable") === "true";
		const type = attr(el, "type");
		const inline = only(el, "xs:complexType");
		let def: ElementDef;
		if (type && inline)
			throw new Error(`element ${name}: both type= and an inline complexType`);
		if (type) {
			const named = loaded.complexTypes.get(type);
			def = named
				? readComplex(named, base, `complexType ${type}`)
				: { kind: "leaf", ...base, nillable, type, attributes: [] };
		} else if (inline) {
			def = readComplex(inline, base, `element ${name}`);
		} else throw new Error(`element ${name}: no type`);
		if (def.kind === "group" && nillable)
			throw new Error(`element ${name}: nillable groups are not supported`);
		return def.kind === "leaf" ? { ...def, nillable } : def;
	}

	const rootNode = loaded.elements.get(rootElement);
	if (!rootNode)
		throw new Error(`No top-level element ${rootElement} in ${entryPath}`);
	const root = readElement(rootNode);
	if (root.kind !== "group") throw new Error(`${rootElement} is not a group`);

	const simpleTypes: Record<string, SimpleType> = {};
	for (const [name, n] of [...loaded.simpleTypes].sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		simpleTypes[name] = readSimpleType(name, n);
	}
	return { root, simpleTypes };
}
