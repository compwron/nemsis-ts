/**
 * The README's TypeScript examples must compile against the real API under the project's strict
 * settings, and every `nemsis-ts/...` import must be a real package export. The examples are
 * extracted, their package imports pointed at `src/`, and type-checked with `tsc` (not run: they
 * read files and call the network-free but slow Schematron compiler).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../scripts/lib/spec.ts";

const pkg = JSON.parse(
	readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
) as {
	name: string;
	exports: Record<string, unknown>;
};

/** Where each package subpath lives in `src/` (the build maps the same entries to `dist/`). */
const SOURCE: Record<string, string> = {
	".": "src/index.ts",
	"./3.5.0": "src/3.5.0.ts",
	"./3.5.1": "src/3.5.1.ts",
	"./3.5.0/lists": "src/lists/v3_5_0.ts",
	"./3.5.1/lists": "src/lists/v3_5_1.ts",
	"./3.5.0/xsd": "src/xsd/v3_5_0.ts",
	"./3.5.1/xsd": "src/xsd/v3_5_1.ts",
	"./validate": "src/validate.ts",
	"./schematron": "src/schematron.ts",
	"./node": "src/node.ts",
};

const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
const blocks = [...readme.matchAll(/^```ts\n([\s\S]*?)^```/gm)].map(
	(m) => m[1] ?? "",
);
const specifiers = (code: string) =>
	[...code.matchAll(/from\s+"(nemsis-ts(?:\/[^"]*)?)"/g)].map(
		(m) => m[1] ?? "",
	);
const subpath = (spec: string) => `.${spec.slice(pkg.name.length)}`;

describe("README examples", () => {
	it("has examples", () => {
		expect(blocks.length).toBeGreaterThan(0);
		expect(blocks.flatMap(specifiers).length).toBeGreaterThan(3);
	});

	it("only import package subpaths that exist, and every export has a source mapping", () => {
		for (const spec of blocks.flatMap(specifiers)) {
			expect(Object.keys(pkg.exports), spec).toContain(subpath(spec));
		}
		expect(Object.keys(SOURCE).sort()).toEqual(Object.keys(pkg.exports).sort());
	});

	it("type-check under the project's strict settings", () => {
		const dir = join(REPO_ROOT, "node_modules", ".cache", "nemsis-ts-readme");
		rmSync(dir, { recursive: true, force: true });
		mkdirSync(dir, { recursive: true });
		try {
			const files = blocks.map((code, i) => {
				const rewritten = code.replace(
					/from\s+"(nemsis-ts(?:\/[^"]*)?)"/g,
					(_m, spec: string) => {
						const target = SOURCE[subpath(spec)];
						if (!target) throw new Error(`No source mapping for ${spec}`);
						return `from "${relative(dir, join(REPO_ROOT, target))}"`;
					},
				);
				const file = join(dir, `example-${i}.ts`);
				writeFileSync(file, `${rewritten}\nexport {};\n`);
				return file;
			});
			writeFileSync(
				join(dir, "tsconfig.json"),
				JSON.stringify({
					extends: join(REPO_ROOT, "tsconfig.json"),
					include: files,
					exclude: [],
				}),
			);
			try {
				execFileSync(
					join(REPO_ROOT, "node_modules", ".bin", "tsc"),
					["-p", join(dir, "tsconfig.json")],
					{
						encoding: "utf8",
						stdio: "pipe",
					},
				);
			} catch (e) {
				const out = e as { stdout?: string };
				throw new Error(
					`README examples do not compile:\n${out.stdout ?? String(e)}`,
				);
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
