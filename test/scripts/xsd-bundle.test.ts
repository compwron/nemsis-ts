/**
 * Optional XSD bundling: with NEMSIS_BUNDLE_XSD set, the build replaces the committed
 * `src/xsd/v3_5_x.ts` stubs with modules embedding that version's verified XSD files.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	bundleXsdPlugin,
	xsdFiles,
	xsdModuleSource,
} from "../../scripts/build/xsd-bundle.ts";
import { formatManifest, hashTree } from "../../scripts/lib/spec.ts";

const VERSION = "3.5.9.990101";

function fixture({ tamper = false } = {}) {
	const work = mkdtempSync(join(tmpdir(), "nemsis-bundle-"));
	const xsds = join(work, ".spec", VERSION, "XSDs", "NEMSIS_XSDs");
	mkdirSync(xsds, { recursive: true });
	mkdirSync(join(work, "spec", "manifests"), { recursive: true });
	writeFileSync(join(xsds, "b_v3.xsd"), "<xs:schema/>\n");
	writeFileSync(join(xsds, "a_v3.xsd"), `<xs:schema a="it's \`odd\` \${x}"/>`);
	const selection = { include: ["XSDs/NEMSIS_XSDs"], extensions: ["xsd"] };
	writeFileSync(
		join(work, "spec", "manifests", `${VERSION}.sha256`),
		formatManifest(hashTree(join(work, ".spec", VERSION), selection)),
	);
	writeFileSync(
		join(work, "spec", "nemsis.lock.json"),
		JSON.stringify({
			repository: "x",
			...selection,
			versions: { [VERSION]: { commit: "a".repeat(40) } },
		}),
	);
	if (tamper) writeFileSync(join(xsds, "b_v3.xsd"), "<tampered/>");
	return {
		lockPath: join(work, "spec", "nemsis.lock.json"),
		specDir: join(work, ".spec"),
	};
}

describe("xsdFiles", () => {
	it("returns the version's XSD files, sorted, with exact contents", () => {
		expect(xsdFiles(VERSION, fixture())).toEqual([
			{ fileName: "a_v3.xsd", contents: `<xs:schema a="it's \`odd\` \${x}"/>` },
			{ fileName: "b_v3.xsd", contents: "<xs:schema/>\n" },
		]);
	});

	it("refuses XSDs that do not match the committed manifest", () => {
		expect(() => xsdFiles(VERSION, fixture({ tamper: true }))).toThrow(
			/3\.5\.9\.990101: XSDs do not match spec\/manifests.*b_v3\.xsd/s,
		);
	});
});

describe("xsdModuleSource", () => {
	it("is a typed module exporting bundled = true and the files as data", () => {
		const options = fixture();
		const source = xsdModuleSource(VERSION, options);
		expect(source).toContain(
			'import type { SchemaFile } from "../validate/xsd.ts";',
		);
		expect(source).toContain("export const bundled: boolean = true;");
		const json =
			/export const schemaFiles: readonly SchemaFile\[\] = (.*);\n$/s.exec(
				source,
			)?.[1];
		expect(JSON.parse(json ?? "null")).toEqual(xsdFiles(VERSION, options));
	});
});

describe("bundleXsdPlugin", () => {
	const plugin = bundleXsdPlugin({
		...fixture(),
		versions: { v3_5_9: VERSION },
	});

	it("replaces the stub module for a known version", () => {
		const code = plugin.load("/repo/src/xsd/v3_5_9.ts");
		expect(code).toContain("export const bundled: boolean = true;");
		expect(code).toContain("a_v3.xsd");
	});

	it("leaves every other module alone", () => {
		expect(plugin.load("/repo/src/xsd/v3_5_8.ts")).toBeNull();
		expect(plugin.load("/repo/src/index.ts")).toBeNull();
	});
});
