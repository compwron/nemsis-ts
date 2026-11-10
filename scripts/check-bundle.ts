/** After `pnpm build`: the root entry stays small and each version entry carries only its own data. */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, readLock } from "./lib/spec.ts";

const dist = join(REPO_ROOT, "dist");
const ROOT_BUDGET = 20 * 1024;
const versions = Object.keys(readLock().versions);
const short = (v: string) => v.split(".").slice(0, 3).join(".");
const errors: string[] = [];

const rootSize = statSync(join(dist, "index.js")).size;
if (rootSize > ROOT_BUDGET)
	errors.push(`dist/index.js is ${rootSize} bytes (budget ${ROOT_BUDGET})`);
for (const v of versions) {
	const js = readFileSync(join(dist, `${short(v)}.js`), "utf8");
	if (!js.includes(v)) errors.push(`dist/${short(v)}.js does not contain ${v}`);
	for (const other of versions.filter((o) => o !== v)) {
		if (js.includes(other))
			errors.push(`dist/${short(v)}.js also contains ${other}`);
	}
	console.log(`dist/${short(v)}.js: ${(js.length / 1024).toFixed(0)} KiB`);
}
console.log(`dist/index.js: ${(rootSize / 1024).toFixed(1)} KiB`);
if (errors.length) {
	console.error(errors.join("\n"));
	process.exit(1);
}
