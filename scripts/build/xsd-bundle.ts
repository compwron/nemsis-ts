/**
 * Optional bundling of the NEMSIS XSDs into the package (`NEMSIS_BUNDLE_XSD=1 pnpm build`).
 *
 * The repo only commits stubs (`src/xsd/v3_5_x.ts`: `bundled = false`, no files). This build
 * plugin swaps each stub for a module embedding that version's XSDs from `.spec/`, after checking
 * every file against the committed manifest. NEMSIS files therefore never enter git; whoever
 * builds with the flag chooses to redistribute them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SchemaFile } from "../../src/validate/xsd.ts";
import { versionDir } from "../codegen/generate.ts";
import {
	diffManifest,
	hashTree,
	isClean,
	LOCK_PATH,
	readLock,
	SPEC_DIR,
} from "../lib/spec.ts";

const XSD_DIR = "XSDs/NEMSIS_XSDs";

export interface BundleOptions {
	lockPath?: string;
	specDir?: string;
}

/** The version's XSD files from `.spec/`, verified against `spec/manifests/<version>.sha256`. */
export function xsdFiles(
	version: string,
	options: BundleOptions = {},
): SchemaFile[] {
	const { lockPath = LOCK_PATH, specDir = SPEC_DIR } = options;
	const root = join(specDir, version);
	const actual = hashTree(root, { include: [XSD_DIR], extensions: ["xsd"] });
	const expected = new Map(
		[...readLock(lockPath).manifest(version)].filter(
			([p]) => p.startsWith(`${XSD_DIR}/`) && p.endsWith(".xsd"),
		),
	);
	const diff = diffManifest(expected, actual);
	if (!isClean(diff) || expected.size === 0) {
		throw new Error(
			`${version}: XSDs do not match spec/manifests/${version}.sha256 (run \`pnpm spec:fetch\`): ${JSON.stringify(diff)}`,
		);
	}
	return [...actual.keys()].map((path) => ({
		fileName: path.slice(XSD_DIR.length + 1),
		contents: readFileSync(join(root, ...path.split("/")), "utf8"),
	}));
}

/** Source for a `src/xsd/v3_5_x.ts` replacement with the same exports and types as the stub. */
export function xsdModuleSource(
	version: string,
	options: BundleOptions = {},
): string {
	return (
		`// Built by scripts/build/xsd-bundle.ts from NEMSIS ${version} (NEMSIS_BUNDLE_XSD).\n` +
		`import type { SchemaFile } from "../validate/xsd.ts";\n\n` +
		"export const bundled: boolean = true;\n" +
		`export const schemaFiles: readonly SchemaFile[] = ${JSON.stringify(xsdFiles(version, options))};\n`
	);
}

export interface BundleXsdPluginOptions extends BundleOptions {
	/** Stub module name → version, e.g. `{ v3_5_1: "3.5.1.251001CP2" }`. Defaults to the lock's versions. */
	versions?: Record<string, string>;
}

/** Rolldown plugin that replaces the XSD stub modules with bundled XSD data. */
export function bundleXsdPlugin(options: BundleXsdPluginOptions = {}): {
	name: string;
	load(id: string): string | null;
} {
	const versions =
		options.versions ??
		Object.fromEntries(
			Object.keys(readLock(options.lockPath).versions).map((v) => [
				versionDir(v),
				v,
			]),
		);
	return {
		name: "nemsis-bundle-xsd",
		load(id) {
			const stub = /[\\/]src[\\/]xsd[\\/](v\d+_\d+_\d+)\.ts$/.exec(id)?.[1];
			const version = stub && versions[stub];
			return version ? xsdModuleSource(version, options) : null;
		},
	};
}
