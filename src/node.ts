/** Node-only helpers (filesystem and child processes). Import as `nemsis-ts/node`. */
import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { patchCompiledSchematron } from "./schematron/patches.ts";
import { loadSaxon, type SaxonJS } from "./schematron/saxon.ts";
import type { SchemaFile } from "./validate/xsd.ts";

/** Read every `.xsd` in `dir` (e.g. a NEMSIS release's `XSDs/NEMSIS_XSDs`), sorted by file name. */
export function loadSchemaFiles(dir: string): SchemaFile[] {
	return readdirSync(dir)
		.filter((f) => f.endsWith(".xsd"))
		.sort()
		.map((fileName) => ({
			fileName,
			contents: readFileSync(join(dir, fileName), "utf8"),
		}));
}

export interface CompileSchematronOptions {
	/** Path to a NEMSIS rules file, e.g. `Schematron/rules/EMSDataSet.sch`. */
	readonly schematron: string;
	/**
	 * The ISO Schematron XSLT 2 skeleton directory shipped by NEMSIS:
	 * `Schematron/DevelopmentKit/Schematron/utilities/iso-schematron-xslt2`.
	 */
	readonly skeletonDir: string;
	/** A SaxonJS instance; defaults to the `saxon-js` npm package. */
	readonly saxon?: SaxonJS;
	/** Path to the `xslt3` compiler script; defaults to the `xslt3` npm package. */
	readonly xslt3?: string;
}

const TRANSFORM = `transform(map{
	'stylesheet-location': $xsl,
	'source-node': parse-xml($source),
	'delivery-format': 'serialized',
	'stylesheet-params': map{ QName('', 'allow-foreign'): 'true' }
})?output`;

/**
 * Compile NEMSIS Schematron rules to a SaxonJS SEF (JSON text) for `nemsis-ts/schematron`:
 * the official ISO pipeline (dsdl include → abstract expand → SVRL for XSLT 2, with foreign
 * elements allowed, as NEMSIS does), then the SaxonJS workarounds, then `xslt3 -export`.
 * Slow (tens of seconds): compile once and cache the result.
 */
export async function compileSchematron(
	options: CompileSchematronOptions,
): Promise<string> {
	const saxon = options.saxon ?? (await loadSaxon());
	const step = (file: string, source: string) =>
		String(
			saxon.XPath.evaluate(TRANSFORM, null, {
				params: {
					xsl: pathToFileURL(join(options.skeletonDir, file)).href,
					source,
				},
			}),
		);
	let xsl = await readFile(options.schematron, "utf8");
	for (const file of [
		"iso_dsdl_include.xsl",
		"iso_abstract_expand.xsl",
		"iso_svrl_for_xslt2.xsl",
	]) {
		xsl = step(file, xsl);
	}
	const compiler =
		options.xslt3 ?? createRequire(import.meta.url).resolve("xslt3");
	const dir = await mkdtemp(join(tmpdir(), "nemsis-sch-"));
	try {
		const xslPath = join(dir, "rules.xsl");
		const sefPath = join(dir, "rules.sef.json");
		await writeFile(xslPath, patchCompiledSchematron(xsl).xsl);
		await promisify(execFile)(
			process.execPath,
			[
				compiler,
				`-xsl:${xslPath}`,
				`-export:${sefPath}`,
				"-nogo",
				"-relocate:on",
			],
			{
				maxBuffer: 64 * 1024 * 1024,
			},
		);
		return await readFile(sefPath, "utf8");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
