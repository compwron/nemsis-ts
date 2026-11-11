/**
 * After `pnpm build` (or `pnpm build:with-xsd`, with NEMSIS_BUNDLE_XSD=1 also set here):
 * - the root entry stays small and each version entry carries only its own schema data
 * - `<version>/xsd` is an empty stub by default, or the verified XSDs when bundling, in which
 *   case the bundled XSDs alone must validate an official compliance case
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT, readLock, SPEC_DIR } from "./lib/spec.ts";

const dist = join(REPO_ROOT, "dist");
const ROOT_BUDGET = 20 * 1024;
const STUB_BUDGET = 1024;
const bundling = Boolean(process.env.NEMSIS_BUNDLE_XSD);
const versions = Object.keys(readLock().versions);
const short = (v: string) => v.split(".").slice(0, 3).join(".");
const errors: string[] = [];

const rootSize = statSync(join(dist, "index.js")).size;
if (rootSize > ROOT_BUDGET)
	errors.push(`dist/index.js is ${rootSize} bytes (budget ${ROOT_BUDGET})`);
console.log(`dist/index.js: ${(rootSize / 1024).toFixed(1)} KiB`);

type XsdModule = {
	bundled: boolean;
	schemaFiles: { fileName: string; contents: string }[];
};
type ValidateModule = {
	createXsdValidator(files: XsdModule["schemaFiles"]): {
		validate(xml: string): Promise<{ valid: boolean }>;
	};
};
const { createXsdValidator } = (await import(
	pathToFileURL(join(dist, "validate.js")).href
)) as ValidateModule;

// A line that only the given version's Procedure list contains (3.5.1 added this code).
const lists: Record<string, string | undefined> = {
	"3.5.0.251001CP6": undefined,
	"3.5.1.251001CP2": "116859006",
};

for (const v of versions) {
	const s = short(v);
	const js = readFileSync(join(dist, `${s}.js`), "utf8");
	if (!js.includes(v)) errors.push(`dist/${s}.js does not contain ${v}`);
	for (const other of versions.filter((o) => o !== v)) {
		if (js.includes(other)) errors.push(`dist/${s}.js also contains ${other}`);
	}
	console.log(`dist/${s}.js: ${(js.length / 1024).toFixed(0)} KiB`);

	// The lists entry carries only its own version's lists, and the version entry carries none.
	const listsJs = readFileSync(join(dist, s, "lists.js"), "utf8");
	if (!listsJs.includes("eSituation.09"))
		errors.push(`dist/${s}/lists.js has no defined lists`);
	if (js.includes("SuggestedLabel") || js.includes("suggestedLabel"))
		errors.push(`dist/${s}.js unexpectedly contains defined-list data`);
	for (const other of versions.filter((o) => o !== v)) {
		const marker = lists[other];
		if (marker && listsJs.includes(marker))
			errors.push(`dist/${s}/lists.js also contains ${other} list data`);
	}
	console.log(`dist/${s}/lists.js: ${(listsJs.length / 1024).toFixed(0)} KiB`);

	const xsdPath = join(dist, s, "xsd.js");
	const xsd = (await import(pathToFileURL(xsdPath).href)) as XsdModule;
	const size = statSync(xsdPath).size;
	if (!bundling) {
		if (xsd.bundled || xsd.schemaFiles.length || size > STUB_BUDGET) {
			errors.push(
				`dist/${s}/xsd.js should be an empty stub (bundled=${xsd.bundled}, ${size} bytes)`,
			);
		}
	} else {
		const names = xsd.schemaFiles.map((f) => f.fileName);
		if (!xsd.bundled || !names.includes("EMSDataSet_v3.xsd")) {
			errors.push(
				`dist/${s}/xsd.js should bundle the XSDs (bundled=${xsd.bundled}, ${names.length} files)`,
			);
		} else {
			const sample = join(
				SPEC_DIR,
				v,
				"Compliance",
				"Pre-Testing",
				"xml",
				"national",
			);
			// The first national EMS case (its name changes with each year's compliance refresh).
			const file =
				readdirSync(sample)
					.sort()
					.find((f) => f.includes("-EMS-1-")) ?? "";
			const result = await createXsdValidator(xsd.schemaFiles).validate(
				readFileSync(join(sample, file), "utf8"),
			);
			if (!result.valid)
				errors.push(
					`bundled ${s} XSDs did not validate compliance case ${file}`,
				);
		}
	}
	console.log(
		`dist/${s}/xsd.js: ${bundling ? `${xsd.schemaFiles.length} XSDs, ` : "stub, "}${(size / 1024).toFixed(1)} KiB`,
	);
}

if (errors.length) {
	console.error(errors.join("\n"));
	process.exit(1);
}
