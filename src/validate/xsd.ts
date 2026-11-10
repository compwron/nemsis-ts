/**
 * XSD validation of NEMSIS documents with libxml2 (via `xmllint-wasm`), in Node or the browser.
 *
 * The validator is given the NEMSIS XSD files rather than bundling them: in Node, load them with
 * `loadSchemaFiles()` from `nemsis-ts/node`; in the browser, fetch them however suits the app.
 */
import { validateXML } from "xmllint-wasm";
import type { DatasetName } from "../schema/types.ts";

export interface SchemaFile {
	/** File name as referenced by `xs:include` (e.g. `commonTypes_v3.xsd`). */
	readonly fileName: string;
	readonly contents: string;
}

export interface XsdIssue {
	/** 1-based line in the validated document, when known. */
	readonly line: number | null;
	/** NEMSIS element the error is about (e.g. `eSituation.19`), when libxml2 names one. */
	readonly element?: string;
	readonly message: string;
}

export interface XsdResult {
	readonly valid: boolean;
	/** Dataset named by the document's root element, if it is one. */
	readonly dataset: DatasetName | undefined;
	readonly errors: readonly XsdIssue[];
}

export interface XsdValidatorOptions {
	/** WebAssembly memory limit in 64 KiB pages, for very large documents (default 32 MiB). */
	readonly maxMemoryPages?: number;
}

export interface XsdValidator {
	validate(xml: string): Promise<XsdResult>;
}

const DATASETS: readonly DatasetName[] = [
	"EMSDataSet",
	"DEMDataSet",
	"StateDataSet",
];
const DOCUMENT = "document.xml";

/** Name and line of the root element, skipping the XML declaration, comments, PIs and DOCTYPE. */
export function rootElement(
	xml: string,
): { name: string; line: number } | undefined {
	const prolog =
		/^(?:\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/.exec(xml)?.[0] ??
		"";
	const m = /^<([A-Za-z_][\w.:-]*)/.exec(xml.slice(prolog.length));
	if (!m?.[1]) return undefined;
	const name = m[1].slice(m[1].indexOf(":") + 1);
	return { name, line: prolog.split("\n").length };
}

const ELEMENT = /Element '(?:\{[^}]*\})?([^']+)'/;

export function createXsdValidator(
	files: readonly SchemaFile[],
	options: XsdValidatorOptions = {},
): XsdValidator {
	const byName = new Map(files.map((f) => [f.fileName, f]));
	return {
		async validate(xml) {
			const root = rootElement(xml);
			const dataset = DATASETS.find((d) => d === root?.name);
			if (!dataset) {
				const what = root ? `Root element <${root.name}>` : "Document";
				return {
					valid: false,
					dataset: undefined,
					errors: [
						{
							line: root?.line ?? null,
							message: `${what} is not a NEMSIS dataset (${DATASETS.join(", ")})`,
						},
					],
				};
			}
			const schema = byName.get(`${dataset}_v3.xsd`);
			if (!schema) {
				return {
					valid: false,
					dataset,
					errors: [
						{
							line: null,
							message: `No schema provided for ${dataset} (expected ${dataset}_v3.xsd)`,
						},
					],
				};
			}
			const result = await validateXML({
				xml: { fileName: DOCUMENT, contents: xml },
				schema,
				preload: files.filter((f) => f !== schema),
				...(options.maxMemoryPages
					? { maxMemoryPages: options.maxMemoryPages }
					: {}),
			});
			const errors = result.errors.map((e): XsdIssue => {
				const element = ELEMENT.exec(e.message)?.[1];
				return {
					line: e.loc?.fileName === DOCUMENT ? e.loc.lineNumber : null,
					...(element ? { element } : {}),
					message: e.message.trim(),
				};
			});
			return { valid: result.valid, dataset, errors };
		},
	};
}
