import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SPEC_DIR } from "../../scripts/lib/spec.ts";

/** Root of the fetched artifacts for a version, or undefined when `.spec/` has not been fetched. */
export function specRoot(version: string): string | undefined {
	const root = join(SPEC_DIR, version);
	if (existsSync(join(root, ".commit"))) return root;
	if (process.env.CI)
		throw new Error(`.spec/${version} missing in CI; run \`pnpm spec:fetch\``);
	console.warn(
		`[skip] .spec/${version} not fetched; run \`pnpm spec:fetch\` to enable golden tests`,
	);
	return undefined;
}

/**
 * Parse a NEMSIS data-dictionary "Ancillary" file: every field is wrapped in single quotes and
 * terminated by `|`. Quotes inside values are not escaped, so split on the `'|'` sequence.
 */
export function readDictionary(path: string): Record<string, string>[] {
	const lines = readFileSync(path, "utf8")
		.replace(/^﻿/, "")
		.split(/\r?\n/)
		.filter(Boolean);
	const split = (line: string): string[] => {
		if (!line.startsWith("'") || !line.endsWith("'|"))
			throw new Error(`Unexpected line: ${line}`);
		return line.slice(1, -2).split("'|'");
	};
	const [header, ...rows] = lines.map(split);
	if (!header) throw new Error(`Empty dictionary: ${path}`);
	return rows.map((cells) => {
		if (cells.length !== header.length)
			throw new Error(`Bad column count in ${path}: ${cells.join("|")}`);
		return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
	});
}
