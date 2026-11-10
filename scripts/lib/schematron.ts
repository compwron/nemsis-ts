/** Compile the fetched NEMSIS Schematron rules to SaxonJS SEFs under `.spec/<version>/compiled/`, cached. */
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { compileSchematron } from "../../src/node.ts";
import type { DatasetName } from "../../src/schema/types.ts";
import { SCHEMATRON_PATCHES } from "../../src/schematron/patches.ts";
import { SPEC_DIR } from "./spec.ts";

export const SKELETON_DIR: string = join(
	"Schematron",
	"DevelopmentKit",
	"Schematron",
	"utilities",
	"iso-schematron-xslt2",
);
export const DATASETS: readonly DatasetName[] = [
	"EMSDataSet",
	"DEMDataSet",
	"StateDataSet",
];

const require = createRequire(import.meta.url);
const packageVersion = (name: string) =>
	(
		JSON.parse(
			readFileSync(require.resolve(`${name}/package.json`), "utf8"),
		) as { version: string }
	).version;

/** Everything a compiled SEF depends on: rules, skeleton, compiler versions and our patches. */
export function compileKey(root: string, dataset: DatasetName): string {
	const hash = createHash("sha256");
	hash.update(
		readFileSync(join(root, "Schematron", "rules", `${dataset}.sch`)),
	);
	const skeleton = join(root, SKELETON_DIR);
	for (const f of readdirSync(skeleton).sort())
		hash.update(f).update(readFileSync(join(skeleton, f)));
	hash.update(
		`saxon-js@${packageVersion("saxon-js")} xslt3@${packageVersion("xslt3")}`,
	);
	hash.update(JSON.stringify(SCHEMATRON_PATCHES));
	return hash.digest("hex");
}

/** Path of the compiled SEF for `dataset`, compiling it first unless an up-to-date one exists. */
export async function ensureCompiled(
	version: string,
	dataset: DatasetName,
	options: { specDir?: string; log?: (m: string) => void } = {},
): Promise<string> {
	const root = join(options.specDir ?? SPEC_DIR, version);
	const dir = join(root, "compiled");
	const sef = join(dir, `${dataset}.sef.json`);
	const stamp = `${sef}.key`;
	const key = compileKey(root, dataset);
	if (
		existsSync(sef) &&
		existsSync(stamp) &&
		readFileSync(stamp, "utf8") === key
	)
		return sef;
	(options.log ?? console.log)(`${version}: compiling ${dataset} Schematron`);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		sef,
		await compileSchematron({
			schematron: join(root, "Schematron", "rules", `${dataset}.sch`),
			skeletonDir: join(root, SKELETON_DIR),
		}),
	);
	writeFileSync(stamp, key);
	return sef;
}
