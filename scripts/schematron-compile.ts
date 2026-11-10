/** Compile (or reuse cached) Schematron SEFs for every locked version: `pnpm schematron:compile`. */
import { DATASETS, ensureCompiled } from "./lib/schematron.ts";
import { readLock } from "./lib/spec.ts";

for (const version of Object.keys(readLock().versions)) {
	await Promise.all(DATASETS.map((d) => ensureCompiled(version, d)));
}
