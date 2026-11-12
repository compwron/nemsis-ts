/** A small namespace-aware XML tree, enough to read SOAP responses and re-serialise embedded payloads. */
import { SaxesParser } from "saxes";

const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

export interface XmlAttribute {
	/** Qualified name as written (`xsi:nil`). */
	readonly name: string;
	readonly local: string;
	readonly uri: string;
	readonly value: string;
}

export interface XmlNode {
	/** Qualified name as written (`soap:Body`). */
	readonly name: string;
	readonly local: string;
	readonly uri: string;
	/** Attributes, without namespace declarations. */
	readonly attributes: readonly XmlAttribute[];
	/** Namespace declarations made on this element: prefix (`""` for the default namespace) to URI. */
	readonly namespaces: Readonly<Record<string, string>>;
	/** Child elements and text, in order. Comments and processing instructions are dropped. */
	readonly content: (XmlNode | string)[];
	readonly parent: XmlNode | undefined;
}

/** Parse a document into a tree. Throws on malformed XML and on any DOCTYPE. */
export function parseXmlTree(xml: string): XmlNode {
	const parser = new SaxesParser({ xmlns: true, position: true });
	let root: XmlNode | undefined;
	let current: XmlNode | undefined;
	const fail = (message: string): never => {
		throw new Error(
			`${message} (line ${parser.line}, column ${parser.column})`,
		);
	};
	parser.on("error", (err) =>
		fail(err.message.replace(/^[^:]*:\d+:\d+: /, "")),
	);
	parser.on("doctype", () => fail("DOCTYPE is not allowed"));
	parser.on("opentag", (tag) => {
		const attributes: XmlAttribute[] = [];
		const namespaces: Record<string, string> = {};
		for (const a of Object.values(tag.attributes)) {
			if (a.uri === XMLNS_NS || a.name === "xmlns") {
				namespaces[a.name === "xmlns" ? "" : a.local] = a.value;
			} else {
				attributes.push({
					name: a.name,
					local: a.local,
					uri: a.uri,
					value: a.value,
				});
			}
		}
		const node: XmlNode = {
			name: tag.name,
			local: tag.local,
			uri: tag.uri,
			attributes,
			namespaces,
			content: [],
			parent: current,
		};
		current?.content.push(node);
		root ??= node;
		current = node;
	});
	const text = (t: string) => {
		if (current) current.content.push(t);
	};
	parser.on("text", text);
	parser.on("cdata", text);
	parser.on("closetag", () => {
		current = current?.parent;
	});
	parser.write(xml).close();
	return root ?? fail("Document has no root element");
}

/** The element children of `node`, optionally only those with a given local name and namespace. */
export function elements(
	node: XmlNode,
	local?: string,
	uri?: string,
): XmlNode[] {
	return node.content.filter(
		(c): c is XmlNode =>
			typeof c !== "string" &&
			(local === undefined || c.local === local) &&
			(uri === undefined || c.uri === uri),
	);
}

/** The element's own text, trimmed. */
export function textOf(node: XmlNode): string {
	return node.content
		.filter((c): c is string => typeof c === "string")
		.join("")
		.trim();
}

const TEXT: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\r": "&#xD;",
};
const ATTR: Record<string, string> = {
	...TEXT,
	'"': "&quot;",
	"\n": "&#xA;",
	"\t": "&#x9;",
};
/** Escape character data for element content. */
export const escapeText = (s: string): string =>
	s.replace(/[&<>\r]/g, (c) => TEXT[c] ?? c);
/** Escape a value for a double-quoted attribute. */
export const escapeAttribute = (s: string): string =>
	s.replace(/[&<>\r"\n\t]/g, (c) => ATTR[c] ?? c);

/**
 * Serialise `node` (and its subtree) as a standalone element: namespace declarations in scope
 * from its ancestors are added to it so the result parses on its own.
 */
export function serializeNode(node: XmlNode): string {
	const inherited: Record<string, string> = {};
	for (let n = node.parent; n; n = n.parent) {
		for (const [prefix, uri] of Object.entries(n.namespaces)) {
			if (!(prefix in inherited)) inherited[prefix] = uri;
		}
	}
	return write(node, inherited);
}

function write(node: XmlNode, inherited: Record<string, string>): string {
	const declarations = { ...inherited, ...node.namespaces };
	let out = `<${node.name}`;
	for (const [prefix, uri] of Object.entries(declarations)) {
		out += ` ${prefix === "" ? "xmlns" : `xmlns:${prefix}`}="${escapeAttribute(uri)}"`;
	}
	for (const a of node.attributes)
		out += ` ${a.name}="${escapeAttribute(a.value)}"`;
	if (node.content.length === 0) return `${out}/>`;
	out += ">";
	for (const c of node.content)
		out += typeof c === "string" ? escapeText(c) : write(c, {});
	return `${out}</${node.name}>`;
}
