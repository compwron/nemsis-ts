/** End-to-end codegen over a tiny fixture "release" in a temp directory. */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generate, versionDir } from "../../scripts/codegen/generate.ts";

const NS = `xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns="http://www.nemsis.org" targetNamespace="http://www.nemsis.org" elementFormDefault="qualified"`;
const VERSION = "3.5.9.990101";
const COMMIT = "a".repeat(40);

function dataset(name: string, codeType: string): string {
	return `<xs:schema ${NS}>
		<xs:simpleType name="Code">${codeType}</xs:simpleType>
		<xs:element name="${name}"><xs:complexType><xs:sequence>
			<xs:element name="${name}.01" type="Code" maxOccurs="unbounded"/>
		</xs:sequence></xs:complexType></xs:element>
	</xs:schema>`;
}

function fixture({ commit = COMMIT, demCode = "" } = {}) {
	const work = mkdtempSync(join(tmpdir(), "nemsis-gen-"));
	const xsds = join(work, ".spec", VERSION, "XSDs", "NEMSIS_XSDs");
	mkdirSync(xsds, { recursive: true });
	mkdirSync(join(work, "spec"));
	const code = `<xs:restriction base="xs:string"><xs:enumeration value="1"/></xs:restriction>`;
	writeFileSync(join(xsds, "EMSDataSet_v3.xsd"), dataset("EMSDataSet", code));
	writeFileSync(
		join(xsds, "DEMDataSet_v3.xsd"),
		dataset("DEMDataSet", demCode || code),
	);
	writeFileSync(
		join(xsds, "StateDataSet_v3.xsd"),
		dataset("StateDataSet", code),
	);
	writeFileSync(join(work, ".spec", VERSION, ".commit"), `${commit}\n`);
	writeFileSync(
		join(work, "spec", "nemsis.lock.json"),
		JSON.stringify({
			repository: "x",
			include: [],
			extensions: [],
			versions: { [VERSION]: { commit: COMMIT } },
		}),
	);
	return {
		work,
		options: {
			lockPath: join(work, "spec", "nemsis.lock.json"),
			specDir: join(work, ".spec"),
			outDir: join(work, "out"),
			log: () => {},
		},
	};
}

describe("versionDir", () => {
	it("maps release tags to directory names", () => {
		expect(versionDir("3.5.1.251001CP2")).toBe("v3_5_1");
		expect(() => versionDir("latest")).toThrow(/Unexpected version latest/);
	});
});

describe("generate", () => {
	it("writes the schema model, document types and indexes per version", () => {
		const { options } = fixture();
		mkdirSync(join(options.outDir, "stale"), { recursive: true });
		generate(options);
		const out = (p: string) => readFileSync(join(options.outDir, p), "utf8");

		expect(existsSync(join(options.outDir, "stale"))).toBe(false);
		expect(out("v3_5_9/EMSDataSet.ts")).toContain(
			`from NEMSIS nemsis_public ${VERSION} (${COMMIT})`,
		);
		expect(out("v3_5_9/EMSDataSet.ts")).toContain(
			'export const EMSDataSet: GroupElement = {\n\t"kind": "group"',
		);
		expect(out("v3_5_9/simpleTypes.ts")).toContain('"Code": {');
		expect(out("v3_5_9/index.ts")).toContain(`version: "${VERSION}"`);
		expect(out("v3_5_9/types/codes.ts")).toContain(
			'export type Code =\n\t| "1";',
		);
		expect(out("v3_5_9/types/DEMDataSet.ts")).toContain(
			'\t"DEMDataSet.01": codes.Code[];',
		);
		expect(out("v3_5_9/types/index.ts")).toContain(
			'export type * as State from "./StateDataSet.ts";',
		);
		expect(out("index.ts")).toContain(`\t"${VERSION}": v3_5_9,`);
		expect(out("types.ts")).toContain(
			'export type * as v3_5_9 from "./v3_5_9/types/index.ts";',
		);
	});

	it("refuses a fetched tree whose commit differs from the lock", () => {
		const { options } = fixture({ commit: "b".repeat(40) });
		expect(() => generate(options)).toThrow(
			/is at b{40}, lock says a{40}; re-run spec:fetch/,
		);
	});

	it("refuses simple types that differ between datasets", () => {
		const { options } = fixture({
			demCode: `<xs:restriction base="xs:string"/>`,
		});
		expect(() => generate(options)).toThrow(
			/simpleType Code differs between datasets/,
		);
	});
});
