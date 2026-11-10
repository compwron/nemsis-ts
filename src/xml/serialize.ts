/**
 * Serialize typed NEMSIS documents to XML, driven by a version's schema model.
 *
 * - Elements are written in `xs:sequence` order whatever the object's key order, so output is
 *   order-correct for the XSD.
 * - Values are written exactly (escaped as needed), so `parse(serialize(x))` gives back `x`.
 * - Strict about shape: keys the schema does not know, arrays where one occurrence is allowed,
 *   and malformed leaf values throw `NemsisSerializeError` with a path, instead of silently
 *   dropping data. Whether the document is *valid* (required content, facets, code lists) is
 *   left to `nemsis-ts/validate`.
 */
import type {
	DatasetName,
	ElementDef,
	GroupElement,
	LeafElement,
	VersionSchema,
} from "../schema/types.ts";
import { NEMSIS_NS, XSI_NS } from "./parse.ts";

export interface SerializeOptions {
	/** Indentation per level, or `false` for no whitespace between elements. Default: 4 spaces. */
	readonly indent?: string | false;
	/** Written as the root's `xsi:schemaLocation`. */
	readonly schemaLocation?: string;
	/** Emit the `<?xml version="1.0" encoding="UTF-8"?>` declaration. Default: true. */
	readonly declaration?: boolean;
}

export class NemsisSerializeError extends Error {
	readonly path: string;
	constructor(message: string, path: string) {
		super(`${message} (at ${path})`);
		this.name = "NemsisSerializeError";
		this.path = path;
	}
}

const isMany = (def: ElementDef) =>
	def.maxOccurs === "unbounded" || def.maxOccurs > 1;
const isPlain = (def: LeafElement) =>
	!def.nillable && def.attributes.length === 0;
const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

const TEXT_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\r": "&#xD;",
};
const ATTR_ESCAPES: Record<string, string> = {
	...TEXT_ESCAPES,
	'"': "&quot;",
	"\n": "&#xA;",
	"\t": "&#x9;",
};
const escapeText = (s: string) =>
	s.replace(/[&<>\r]/g, (c) => TEXT_ESCAPES[c] ?? c);
const escapeAttr = (s: string) =>
	s.replace(/[&<>\r"\n\t]/g, (c) => ATTR_ESCAPES[c] ?? c);

/** Whether `s` holds a character XML 1.0 cannot represent at all (not even as a reference). */
function hasInvalidChar(s: string): boolean {
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (
			c < 0x20
				? c !== 0x9 && c !== 0xa && c !== 0xd
				: c === 0xfffe || c === 0xffff
		)
			return true;
		if (c >= 0xd800 && c <= 0xdbff) {
			const next = s.charCodeAt(i + 1);
			if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
			i++;
		} else if (c >= 0xdc00 && c <= 0xdfff) return true;
	}
	return false;
}

export function serializeDocument(
	dataset: DatasetName,
	document: Record<string, unknown>,
	schema: VersionSchema,
	options: SerializeOptions = {},
): string {
	const indent = options.indent ?? "    ";
	const nl = indent === false ? "" : "\n";
	const pad = (depth: number) => (indent === false ? "" : indent.repeat(depth));
	const out: string[] = [];
	let usesNil = false;

	const checkText = (s: unknown, path: string, what: string): string => {
		if (typeof s !== "string")
			throw new NemsisSerializeError(
				`${what} must be a string, got ${typeof s}`,
				path,
			);
		if (hasInvalidChar(s))
			throw new NemsisSerializeError(
				`${what} contains a character XML cannot represent`,
				path,
			);
		return s;
	};

	const attributes = (
		def: ElementDef,
		obj: Record<string, unknown>,
		path: string,
	) => {
		let s = "";
		for (const a of def.attributes) {
			const v = obj[a.name];
			if (v === undefined) continue;
			s += ` ${a.name}="${escapeAttr(checkText(v, `${path}/@${a.name}`, "Attribute value"))}"`;
		}
		return s;
	};

	const leaf = (
		def: LeafElement,
		value: unknown,
		path: string,
		depth: number,
	) => {
		if (isPlain(def)) {
			const text = checkText(value, path, "Value");
			out.push(
				`${pad(depth)}<${def.name}>${escapeText(text)}</${def.name}>${nl}`,
			);
			return;
		}
		if (!isObject(value))
			throw new NemsisSerializeError(
				`<${def.name}> must be { value } or { nil: true }`,
				path,
			);
		const known = new Set([
			"value",
			"nil",
			...def.attributes.map((a) => a.name),
		]);
		for (const k of Object.keys(value)) {
			if (!known.has(k))
				throw new NemsisSerializeError(
					`<${def.name}> has no attribute or property "${k}"`,
					path,
				);
		}
		const attrs = attributes(def, value, path);
		if (value.nil === true) {
			if (value.value !== undefined)
				throw new NemsisSerializeError(
					`<${def.name}> has both nil and a value`,
					path,
				);
			if (!def.nillable)
				throw new NemsisSerializeError(`<${def.name}> is not nillable`, path);
			usesNil = true;
			out.push(`${pad(depth)}<${def.name} xsi:nil="true"${attrs}/>${nl}`);
			return;
		}
		if (value.nil !== undefined)
			throw new NemsisSerializeError(
				`<${def.name}> nil must be true when present`,
				path,
			);
		const text = checkText(value.value, path, "Value");
		out.push(
			`${pad(depth)}<${def.name}${attrs}>${escapeText(text)}</${def.name}>${nl}`,
		);
	};

	const group = (
		def: GroupElement,
		obj: unknown,
		path: string,
		depth: number,
	) => {
		if (!isObject(obj))
			throw new NemsisSerializeError(`<${def.name}> must be an object`, path);
		const known = new Set([
			...def.children.map((c) => c.name),
			...def.attributes.map((a) => a.name),
		]);
		for (const k of Object.keys(obj)) {
			if (!known.has(k))
				throw new NemsisSerializeError(
					`<${def.name}> has no element or attribute "${k}"`,
					path,
				);
		}
		const open = out.push("") - 1; // filled in once we know whether there is content
		const start = out.length;
		for (const child of def.children) {
			const v = obj[child.name];
			if (v === undefined) continue;
			if (isMany(child)) {
				if (!Array.isArray(v))
					throw new NemsisSerializeError(
						`<${child.name}> repeats, so it must be an array`,
						`${path}/${child.name}`,
					);
				v.forEach((item: unknown, i) => {
					element(child, item, `${path}/${child.name}[${i}]`, depth + 1);
				});
			} else {
				if (Array.isArray(v))
					throw new NemsisSerializeError(
						`<${child.name}> occurs at most once, so it cannot be an array`,
						`${path}/${child.name}`,
					);
				element(child, v, `${path}/${child.name}`, depth + 1);
			}
		}
		const attrs = attributes(def, obj, path);
		if (out.length === start)
			out[open] = `${pad(depth)}<${def.name}${attrs}/>${nl}`;
		else {
			out[open] = `${pad(depth)}<${def.name}${attrs}>${nl}`;
			out.push(`${pad(depth)}</${def.name}>${nl}`);
		}
	};

	const element = (
		def: ElementDef,
		value: unknown,
		path: string,
		depth: number,
	) => {
		if (def.kind === "group") group(def, value, path, depth);
		else leaf(def, value, path, depth);
	};

	const root = schema.datasets[dataset] as GroupElement | undefined;
	if (!root)
		throw new NemsisSerializeError(
			`Unknown dataset ${String(dataset)}`,
			String(dataset),
		);
	group(root, document, dataset, 0);
	// Namespace declarations go on the root, after the body tells us whether xsi is needed.
	const schemaLocation = options.schemaLocation;
	const needsXsi = usesNil || schemaLocation !== undefined;
	const decl =
		` xmlns="${NEMSIS_NS}"` +
		(needsXsi ? ` xmlns:xsi="${XSI_NS}"` : "") +
		(schemaLocation !== undefined
			? ` xsi:schemaLocation="${escapeAttr(checkText(schemaLocation, dataset, "schemaLocation"))}"`
			: "");
	out[0] = (out[0] ?? "").replace(`<${dataset}`, `<${dataset}${decl}`);
	const prolog =
		options.declaration === false
			? ""
			: `<?xml version="1.0" encoding="UTF-8"?>\n`;
	return prolog + out.join("") + (nl ? "" : "\n");
}
