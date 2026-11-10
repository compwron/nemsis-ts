/**
 * Run compiled NEMSIS Schematron rules (a SaxonJS SEF, see `compileSchematron` in
 * `nemsis-ts/node`) against a document and return typed SVRL results.
 */
import { SaxesParser } from "saxes";
import { loadSaxon, type SaxonJS } from "./saxon.ts";

const SVRL_NS = "http://purl.oclc.org/dsdl/svrl";

export type SchematronSeverity = "error" | "warning" | "info";

export interface SchematronIssue {
	/** `assert` for a failed `sch:assert`, `report` for a fired `sch:report`. */
	readonly kind: "assert" | "report";
	/** Rule id, e.g. `nemSch_e002`. */
	readonly id: string;
	/** The NEMSIS role as written, e.g. `[ERROR]` or `[WARNING]`. */
	readonly role: string;
	readonly severity: SchematronSeverity;
	/** XPath of the offending node, as SVRL reports it. */
	readonly location: string;
	readonly test: string;
	/** The rule's message, whitespace-normalized. */
	readonly text: string;
}

export interface SchematronResult {
	/** True when no issue has error severity (warnings do not make a document invalid). */
	readonly valid: boolean;
	readonly issues: readonly SchematronIssue[];
	/** The raw SVRL report, including NEMSIS diagnostics and fired rules. */
	readonly svrl: string;
}

export interface SchematronValidator {
	validate(xml: string): Promise<SchematronResult>;
}

export interface SchematronValidatorOptions {
	/** A SaxonJS instance; defaults to loading the `saxon-js` npm package. */
	readonly saxon?: SaxonJS;
}

const severityOf = (role: string): SchematronSeverity => {
	const r = role.replace(/[[\]]/g, "").toLowerCase();
	return r === "error" || r === "fatal"
		? "error"
		: r === "warning" || r === "warn"
			? "warning"
			: "info";
};

/** Extract failed asserts and successful reports from an SVRL document. */
export function parseSvrl(svrl: string): SchematronIssue[] {
	const parser = new SaxesParser({ xmlns: true });
	const issues: SchematronIssue[] = [];
	let current:
		| { kind: "assert" | "report"; attrs: Record<string, string>; text: string }
		| undefined;
	let inText = 0;
	parser.on("opentag", (tag) => {
		if (tag.uri !== SVRL_NS) return;
		if (tag.local === "failed-assert" || tag.local === "successful-report") {
			const attrs = Object.fromEntries(
				Object.values(tag.attributes).map((a) => [a.local, a.value]),
			);
			current = {
				kind: tag.local === "failed-assert" ? "assert" : "report",
				attrs,
				text: "",
			};
		} else if (tag.local === "text" && current) inText++;
	});
	parser.on("text", (t) => {
		if (current && inText) current.text += t;
	});
	parser.on("closetag", (tag) => {
		if (tag.uri !== SVRL_NS) return;
		if (tag.local === "text" && inText) inText--;
		else if (
			(tag.local === "failed-assert" || tag.local === "successful-report") &&
			current
		) {
			const { kind, attrs, text } = current;
			const role = attrs.role ?? "";
			issues.push({
				kind,
				id: attrs.id ?? "",
				role,
				severity: severityOf(role),
				location: attrs.location ?? "",
				test: attrs.test ?? "",
				text: text.replace(/\s+/g, " ").trim(),
			});
			current = undefined;
		}
	});
	parser.on("error", (e) => {
		throw e;
	});
	parser.write(svrl).close();
	return issues;
}

/**
 * Create a validator from a compiled SEF (the JSON text or the parsed object). The SEF is
 * parsed once; each `validate` call runs the rules against one document.
 */
export function createSchematronValidator(
	sef: string | object,
	options: SchematronValidatorOptions = {},
): SchematronValidator {
	const stylesheet =
		typeof sef === "string" ? (JSON.parse(sef) as object) : sef;
	let saxon: Promise<SaxonJS> | undefined = options.saxon
		? Promise.resolve(options.saxon)
		: undefined;
	return {
		async validate(xml) {
			saxon ??= loadSaxon();
			const s = await saxon;
			const { principalResult } = s.transform(
				{
					stylesheetInternal: stylesheet,
					sourceText: xml,
					destination: "serialized",
				},
				"sync",
			);
			const svrl = String(principalResult);
			const issues = parseSvrl(svrl);
			return {
				valid: !issues.some((i) => i.severity === "error"),
				issues,
				svrl,
			};
		},
	};
}
