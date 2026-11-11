import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SKELETON_DIR } from "../../scripts/lib/schematron.ts";
import { compileSchematron } from "../../src/node.ts";
import { patchCompiledSchematron } from "../../src/schematron/patches.ts";
import { loadSaxon } from "../../src/schematron/saxon.ts";
import {
	createSchematronValidator,
	parseSvrl,
	type SaxonJS,
	SCHEMATRON_PATCHES,
} from "../../src/schematron.ts";
import { specRoot } from "../support/spec.ts";

const SVRL = `<svrl:schematron-output xmlns:svrl="http://purl.oclc.org/dsdl/svrl">
	<svrl:fired-rule context="x"/>
	<svrl:failed-assert test="a = 1" id="r1" role="[ERROR]" location="/a[1]">
		<svrl:text>
			First   line
			second.
		</svrl:text>
		<svrl:diagnostic-reference diagnostic="d"><x>ignored</x></svrl:diagnostic-reference>
	</svrl:failed-assert>
	<svrl:successful-report test="b" id="r2" role="[WARNING]" location="/a[1]/b[1]"><svrl:text>B</svrl:text></svrl:successful-report>
	<svrl:failed-assert test="c" id="r3" role="[FATAL]" location="/c"/>
	<svrl:failed-assert test="d" location="/d"><other:text xmlns:other="urn:o">no</other:text></svrl:failed-assert>
	<other xmlns="urn:o"><text>not svrl</text></other>
</svrl:schematron-output>`;

describe("parseSvrl", () => {
	it("extracts failed asserts and successful reports with normalized text and severity", () => {
		expect(parseSvrl(SVRL)).toEqual([
			{
				kind: "assert",
				id: "r1",
				role: "[ERROR]",
				severity: "error",
				location: "/a[1]",
				test: "a = 1",
				text: "First line second.",
			},
			{
				kind: "report",
				id: "r2",
				role: "[WARNING]",
				severity: "warning",
				location: "/a[1]/b[1]",
				test: "b",
				text: "B",
			},
			{
				kind: "assert",
				id: "r3",
				role: "[FATAL]",
				severity: "error",
				location: "/c",
				test: "c",
				text: "",
			},
			{
				kind: "assert",
				id: "",
				role: "",
				severity: "info",
				location: "/d",
				test: "d",
				text: "",
			},
		]);
	});

	it("throws on malformed SVRL", () => {
		expect(() => parseSvrl("<svrl:x")).toThrow();
	});
});

describe("createSchematronValidator", () => {
	const fake = (svrl: string, seen: unknown[] = []): SaxonJS => ({
		transform: (options) => {
			seen.push(options);
			return { principalResult: svrl };
		},
		XPath: { evaluate: () => "" },
		getProcessorInfo: () => ({ productVersion: "fake" }),
	});

	it("runs the SEF once per document and reports validity from error-severity issues", async () => {
		const seen: unknown[] = [];
		const v = createSchematronValidator(`{"N":"package"}`, {
			saxon: fake(SVRL, seen),
		});
		const r = await v.validate("<doc/>");
		expect(r.valid).toBe(false);
		expect(r.issues).toHaveLength(4);
		expect(r.svrl).toBe(SVRL);
		expect(seen).toEqual([
			{
				stylesheetInternal: { N: "package" },
				sourceText: "<doc/>",
				destination: "serialized",
			},
		]);
		const ok = createSchematronValidator(
			{},
			{
				saxon: fake(
					`<svrl:schematron-output xmlns:svrl="http://purl.oclc.org/dsdl/svrl"/>`,
				),
			},
		);
		expect(await ok.validate("<doc/>")).toMatchObject({
			valid: true,
			issues: [],
		});
	});

	it("loads saxon-js on demand by default", async () => {
		const saxon = await loadSaxon();
		expect(saxon.getProcessorInfo().productVersion).toMatch(/^2\./);
		const v = createSchematronValidator({});
		await expect(v.validate("<doc/>")).rejects.toThrow(); // an empty SEF is not a stylesheet
	});
});

describe("patches", () => {
	it("each patch rewrites only what it targets, and counts applications", () => {
		const xsl = `<xsl:when test=". castable as xs:integer or x"/><svrl:failed-assert test=". castable as xs:integer or x"/><xsl:value-of select="format-dateTime(current-dateTime(),'[H01]:[m01] [ZN]')"/>`;
		const { xsl: out, applied } = patchCompiledSchematron(xsl);
		expect(out).toBe(
			`<xsl:when test="normalize-space(.) castable as xs:integer or x"/><svrl:failed-assert test=". castable as xs:integer or x"/><xsl:value-of select="format-dateTime(current-dateTime(),'[H01]:[m01] [Z]')"/>`,
		);
		expect(applied).toEqual({
			"integer-castable-whitespace": 1,
			"timezone-name": 1,
		});
		expect(SCHEMATRON_PATCHES.every((p) => p.reason.length > 20)).toBe(true);
	});
});

const root = specRoot("3.5.1.251001CP2");
describe.skipIf(!root)("compileSchematron (real ISO skeleton)", () => {
	it("compiles a small rule set to a SEF that SaxonJS runs", {
		timeout: 120_000,
	}, async () => {
		const dir = mkdtempSync(join(tmpdir(), "nemsis-sch-test-"));
		try {
			const sch = join(dir, "t.sch");
			writeFileSync(
				sch,
				`<sch:schema xmlns:sch="http://purl.oclc.org/dsdl/schematron" queryBinding="xslt2">
					<sch:ns prefix="nem" uri="http://www.nemsis.org"/>
					<sch:pattern id="p"><sch:rule context="nem:v">
						<sch:assert id="int" role="[ERROR]" test=". castable as xs:integer">not an integer</sch:assert>
						<sch:report id="big" role="[WARNING]" test="number(.) gt 100">big: <sch:value-of select="."/></sch:report>
					</sch:rule></sch:pattern>
				</sch:schema>`,
			);
			const sef = await compileSchematron({
				schematron: sch,
				skeletonDir: join(root ?? "", SKELETON_DIR),
			});
			const v = createSchematronValidator(sef);
			const run = async (body: string) =>
				(
					await v.validate(`<r xmlns="http://www.nemsis.org">${body}</r>`)
				).issues.map((i) => `${i.id} ${i.text}`);
			expect(await run(`<v>5</v>`)).toEqual([]);
			expect(await run(`<v>x</v><v>500</v>`)).toEqual([
				"int not an integer",
				"big big: 500",
			]);
			// The SaxonJS whitespace workaround applies to compiled rules.
			expect(await run(`<v>7\n                </v>`)).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
