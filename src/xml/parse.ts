/**
 * Parse NEMSIS XML into typed documents, driven by a version's schema model.
 *
 * - Lossless for everything the types can hold: values keep their exact text, `xsi:nil` becomes
 *   `nil: true`, attributes (NV, PN, CorrelationID, ...) keep their names, repeating elements
 *   become arrays.
 * - Tolerant: content the schema model cannot place (unknown elements/attributes, too many
 *   occurrences, missing required items, ...) is reported as an issue with a path and position.
 *   Validating against the XSD remains the job of `nemsis-ts/validate`.
 * - Strict about well-formedness (via `saxes`): malformed XML throws `NemsisParseError`, and so
 *   does any DOCTYPE, which NEMSIS never uses (ruling out entity-expansion tricks).
 */
import { SaxesParser, type SaxesTagNS } from "saxes";
import type {
	AttributeDef,
	DatasetName,
	ElementDef,
	GroupElement,
	LeafElement,
	VersionSchema,
} from "../schema/types.ts";

export const NEMSIS_NS = "http://www.nemsis.org";
export const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

export type ParseIssueCode =
	| "unknown-element"
	| "unknown-attribute"
	| "missing-element"
	| "missing-attribute"
	| "too-many"
	| "not-nillable"
	| "nil-with-content"
	| "unexpected-text";

export interface ParseIssue {
	readonly code: ParseIssueCode;
	readonly message: string;
	/** e.g. `EMSDataSet/Header[0]/PatientCareReport[2]/eVitals/eVitals.VitalGroup[0]/eVitals.06` */
	readonly path: string;
	readonly line: number;
	readonly column: number;
}

export interface UntypedParseResult {
	readonly dataset: DatasetName;
	readonly document: Record<string, unknown>;
	/** The root's `xsi:schemaLocation`, if present. */
	readonly schemaLocation?: string;
	readonly issues: readonly ParseIssue[];
}

/**
 * A parse result typed by a version's document types, discriminated by `dataset`. The document
 * is a typed view of what was found: when `issues` is non-empty, required content may be absent.
 */
export type TypedParseResult<Docs extends Record<DatasetName, unknown>> = {
	readonly [D in DatasetName]: {
		readonly dataset: D;
		readonly document: Docs[D];
		readonly schemaLocation?: string;
		readonly issues: readonly ParseIssue[];
	};
}[DatasetName];

export class NemsisParseError extends Error {
	readonly line: number;
	readonly column: number;
	constructor(message: string, line: number, column: number) {
		super(`${message} (line ${line}, column ${column})`);
		this.name = "NemsisParseError";
		this.line = line;
		this.column = column;
	}
}

interface Position {
	readonly path: string;
	readonly line: number;
	readonly column: number;
}

type Frame =
	| (Position & {
			kind: "group";
			def: GroupElement;
			obj: Record<string, unknown>;
			counts: Map<string, number>;
	  })
	| (Position & {
			kind: "leaf";
			def: LeafElement;
			text: string;
			nil: boolean;
			attrs: Record<string, string>;
			index: number;
	  })
	| { kind: "skip" };

const isMany = (def: ElementDef) =>
	def.maxOccurs === "unbounded" || def.maxOccurs > 1;
const displayName = (tag: SaxesTagNS) =>
	tag.uri === NEMSIS_NS ? tag.local : `{${tag.uri}}${tag.local}`;
const isPlain = (def: LeafElement) =>
	!def.nillable && def.attributes.length === 0;

export function parseDocument(
	xml: string,
	schema: VersionSchema,
): UntypedParseResult {
	const parser = new SaxesParser({ xmlns: true, position: true });
	const issues: ParseIssue[] = [];
	const stack: Frame[] = [];
	let result:
		| {
				dataset: DatasetName;
				document: Record<string, unknown>;
				schemaLocation?: string;
		  }
		| undefined;

	const fail = (message: string): never => {
		throw new NemsisParseError(message, parser.line, parser.column);
	};
	const issue = (
		code: ParseIssueCode,
		message: string,
		path: string,
		at?: Position,
	) => {
		issues.push({
			code,
			message,
			path,
			line: at?.line ?? parser.line,
			column: at?.column ?? parser.column,
		});
	};

	parser.on("error", (e) => fail(e.message.replace(/^[^:]*:\d+:\d+: /, "")));
	parser.on("doctype", () =>
		fail("DOCTYPE is not allowed in NEMSIS documents"),
	);

	/** Read declared attributes into `target`; report unknown ones. Returns xsi:nil / schemaLocation. */
	function readAttributes(
		tag: SaxesTagNS,
		declared: readonly AttributeDef[],
		path: string,
		target: Record<string, string>,
	) {
		let nil = false;
		let schemaLocation: string | undefined;
		for (const a of Object.values(tag.attributes)) {
			if (a.uri === XMLNS_NS || a.name === "xmlns") continue;
			if (a.uri === XSI_NS && a.local === "nil")
				nil = a.value === "true" || a.value === "1";
			else if (
				a.uri === XSI_NS &&
				a.local === "schemaLocation" &&
				stack.length === 0
			)
				schemaLocation = a.value;
			else if (a.uri === "" && declared.some((d) => d.name === a.local))
				target[a.local] = a.value;
			else
				issue(
					"unknown-attribute",
					`Unexpected attribute ${a.name} on <${tag.local}>`,
					`${path}/@${a.name}`,
				);
		}
		for (const d of declared) {
			if (d.required && !(d.name in target)) {
				issue(
					"missing-attribute",
					`Missing required attribute ${d.name} on <${tag.local}>`,
					`${path}/@${d.name}`,
				);
			}
		}
		return { nil, schemaLocation };
	}

	function open(
		tag: SaxesTagNS,
		def: ElementDef,
		path: string,
		index: number,
	): Frame {
		const at = { path, line: parser.line, column: parser.column };
		if (def.kind === "group") {
			const obj: Record<string, string> = {};
			const { schemaLocation } = readAttributes(tag, def.attributes, path, obj);
			if (schemaLocation !== undefined && result)
				result.schemaLocation = schemaLocation;
			return { kind: "group", def, obj, counts: new Map(), ...at };
		}
		const attrs: Record<string, string> = {};
		let { nil } = readAttributes(tag, def.attributes, path, attrs);
		if (nil && !def.nillable) {
			issue(
				"not-nillable",
				`<${def.name}> is not nillable but has xsi:nil="true"`,
				path,
			);
			nil = false;
		}
		return { kind: "leaf", def, text: "", nil, attrs, index, ...at };
	}

	parser.on("opentag", (tag) => {
		const parent = stack.at(-1);
		if (!parent) {
			if (result) fail("Multiple root elements");
			if (tag.uri !== NEMSIS_NS)
				fail(
					`Root element <${tag.local}> is not in the NEMSIS namespace (${NEMSIS_NS})`,
				);
			const dataset = (
				["EMSDataSet", "DEMDataSet", "StateDataSet"] as const
			).find((d) => d === tag.local);
			if (!dataset)
				return fail(`Root element <${tag.local}> is not a NEMSIS dataset`);
			result = { dataset, document: {} };
			const frame = open(tag, schema.datasets[dataset], dataset, 0);
			if (frame.kind === "group") result.document = frame.obj;
			stack.push(frame);
			return;
		}
		if (parent.kind === "skip") {
			stack.push(parent);
			return;
		}
		const name = displayName(tag);
		if (parent.kind === "leaf") {
			issue(
				"unknown-element",
				`Unexpected element <${name}> in <${parent.def.name}>`,
				`${parent.path}/${name}`,
			);
			stack.push({ kind: "skip" });
			return;
		}
		const def =
			tag.uri === NEMSIS_NS
				? parent.def.children.find((c) => c.name === tag.local)
				: undefined;
		if (!def) {
			issue(
				"unknown-element",
				`Unexpected element <${name}> in <${parent.def.name}>`,
				`${parent.path}/${name}`,
			);
			stack.push({ kind: "skip" });
			return;
		}
		const index = parent.counts.get(def.name) ?? 0;
		parent.counts.set(def.name, index + 1);
		const path = `${parent.path}/${def.name}${isMany(def) ? `[${index}]` : ""}`;
		if (def.maxOccurs !== "unbounded" && index >= def.maxOccurs) {
			issue(
				"too-many",
				`Too many <${def.name}> in <${parent.def.name}> (max ${def.maxOccurs})`,
				`${parent.path}/${def.name}`,
			);
			stack.push({ kind: "skip" });
			return;
		}
		stack.push(open(tag, def, path, index));
	});

	const onText = (text: string) => {
		const top = stack.at(-1);
		if (top?.kind === "leaf") top.text += text;
		else if (top?.kind === "group" && text.trim() !== "")
			issue(
				"unexpected-text",
				`Unexpected text in <${top.def.name}>`,
				top.path,
			);
	};
	parser.on("text", onText);
	parser.on("cdata", onText);

	parser.on("closetag", () => {
		const frame = stack.pop();
		const parent = stack.at(-1);
		if (!frame || frame.kind === "skip") return;
		let value: unknown;
		if (frame.kind === "group") {
			for (const child of frame.def.children) {
				if (child.minOccurs > 0 && !frame.counts.has(child.name)) {
					issue(
						"missing-element",
						`Missing required element <${child.name}> in <${frame.def.name}>`,
						`${frame.path}/${child.name}`,
						frame,
					);
				}
			}
			value = frame.obj;
		} else {
			if (frame.nil && frame.text.trim() !== "") {
				issue(
					"nil-with-content",
					`<${frame.def.name}> has xsi:nil="true" but also content`,
					frame.path,
					frame,
				);
			}
			if (isPlain(frame.def)) value = frame.text;
			else
				value = frame.nil
					? { nil: true, ...frame.attrs }
					: { value: frame.text, ...frame.attrs };
		}
		if (parent?.kind !== "group") return;
		const key = frame.def.name;
		if (isMany(frame.def)) {
			const list = parent.obj[key] as unknown[] | undefined;
			if (list) list.push(value);
			else parent.obj[key] = [value];
		} else {
			parent.obj[key] = value;
		}
	});

	parser.write(xml).close();
	if (!result) return fail("Document has no root element");
	return { ...result, issues };
}
