/**
 * Emit TypeScript document types from the schema model.
 *
 * - each named simple type → `codes.<Name>`: a union of its codes when enumerated, else `string`
 * - each group element → an interface: attributes, then children in sequence order
 * - leaves → the simple type, or `Leaf` / `NillableLeaf` when they carry attributes or can be nil
 * - `maxOccurs > 1` → array; `minOccurs = 0` → optional property
 */
import { walk } from "../../src/schema/model.ts";
import type {
	AttributeDef,
	ElementDef,
	ElementDoc,
	GroupElement,
	SimpleType,
} from "../../src/schema/types.ts";

const RESERVED = new Set(["codes", "Leaf", "NillableLeaf"]);

export function typeName(simpleType: string): string {
	return simpleType.replace(/[^A-Za-z0-9_$]/g, "_");
}

export function interfaceName(element: string): string {
	return element
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
		.map((p) => p[0]?.toUpperCase() + p.slice(1))
		.join("");
}

const comment = (s: string) => s.replace(/\*\//g, "*\\/");

function typeRef(name: string): string {
	return name.startsWith("xs:") ? "string" : `codes.${typeName(name)}`;
}

export function emitSimpleTypes(
	types: Readonly<Record<string, SimpleType>>,
): string {
	const seen = new Map<string, string>();
	const out: string[] = [];
	for (const t of Object.values(types)) {
		const id = typeName(t.name);
		const clash = seen.get(id);
		if (clash)
			throw new Error(`Simple types ${clash} and ${t.name} both map to ${id}`);
		seen.set(id, t.name);
		const facets = Object.entries(t.facets).map(
			([k, v]) => `${k} ${Array.isArray(v) ? v.join(" | ") : v}`,
		);
		out.push(
			`/** \`${t.name}\`: ${comment([t.base, ...facets].join("; "))} */`,
		);
		if (t.enumeration?.length) {
			const members = t.enumeration.map(
				(e) =>
					`${e.description ? `\t/** ${comment(e.description)} */\n` : ""}\t| ${JSON.stringify(e.value)}`,
			);
			out.push(`export type ${id} =\n${members.join("\n")};\n`);
		} else {
			out.push(`export type ${id} = string;\n`);
		}
	}
	return out.join("\n");
}

function attributeType(a: AttributeDef): string {
	if (a.union) return a.union.map(typeRef).join(" | ");
	return typeRef(a.type ?? "xs:string");
}

function attributeMembers(
	attrs: readonly AttributeDef[],
	sep: string,
): string[] {
	return attrs.map(
		(a) => `${a.name}${a.required ? "" : "?"}: ${attributeType(a)}${sep}`,
	);
}

function leafType(el: Extract<ElementDef, { kind: "leaf" }>): string {
	const value = typeRef(el.type);
	if (!el.nillable && el.attributes.length === 0) return value;
	const attrs = el.attributes.length
		? `, { ${attributeMembers(el.attributes, "").join("; ")} }`
		: "";
	return `${el.nillable ? "NillableLeaf" : "Leaf"}<${value}${attrs}>`;
}

function docLines(
	doc: ElementDoc | undefined,
	indent: string,
	detailed: boolean,
): string[] {
	if (!doc) return [];
	const flags = [doc.usage, doc.national && "National", doc.state && "State"]
		.filter(Boolean)
		.join(", ");
	const title = comment(
		`${doc.number}: ${doc.name} (${detailed ? flags : doc.usage})`,
	);
	const body =
		detailed && doc.definition ? comment(doc.definition).split(/\r?\n/) : [];
	const tags = doc.deprecated ? ["@deprecated"] : [];
	if (!body.length && !tags.length) return [`${indent}/** ${title} */`];
	return [
		`${indent}/**`,
		`${indent} * ${title}`,
		...[...body, ...tags].flatMap((l) => [
			`${indent} *`,
			`${indent} * ${l.trim()}`.trimEnd(),
		]),
		`${indent} */`,
	].filter(
		(l, i, all) => !(l === `${indent} *` && all[i + 1] === `${indent} *`),
	);
}

export function emitDatasetTypes(root: GroupElement): string {
	const names = new Map<string, string>();
	const out: string[] = [];
	for (const [el] of walk(root)) {
		if (el.kind !== "group") continue;
		const id = interfaceName(el.name);
		if (RESERVED.has(id))
			throw new Error(`Group ${el.name} maps to reserved name ${id}`);
		const clash = names.get(id);
		if (clash)
			throw new Error(
				`Groups ${clash} and ${el.name} both map to interface ${id}`,
			);
		names.set(id, el.name);

		const members = [
			...attributeMembers(el.attributes, ";").map((m) => `\t${m}`),
			...el.children.flatMap((c) => {
				const base = c.kind === "group" ? interfaceName(c.name) : leafType(c);
				const many = c.maxOccurs === "unbounded" || c.maxOccurs > 1;
				const t = many ? `${base}[]` : base;
				return [
					...docLines(c.doc, "\t", c.kind === "leaf"),
					`\t${JSON.stringify(c.name)}${c.minOccurs === 0 ? "?" : ""}: ${t};`,
				];
			}),
		];
		out.push(
			[
				...docLines(el.doc, "", false),
				`export interface ${id} {`,
				...members,
				"}\n",
			].join("\n"),
		);
	}
	return out.join("\n");
}
