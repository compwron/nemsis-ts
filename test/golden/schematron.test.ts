/**
 * Schematron validation against NEMSIS's own test suite: for every `SampleData/Schematron`
 * case, the failed asserts and fired reports must equal those in the expected SVRL (produced by
 * NEMSIS with Saxon on Java). Compliance cases: `full`/`national` have no errors,
 * `FailSchematron` has errors.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DATASETS, ensureCompiled } from "../../scripts/lib/schematron.ts";
import { SUPPORTED_VERSIONS } from "../../src/index.ts";
import type { DatasetName } from "../../src/schema/types.ts";
import {
	createSchematronValidator,
	parseSvrl,
	type SchematronIssue,
	type SchematronValidator,
} from "../../src/schematron.ts";
import { specRoot } from "../support/spec.ts";

const SHORT: Record<DatasetName, string> = {
	EMSDataSet: "EMS",
	DEMDataSet: "DEM",
	StateDataSet: "State",
};
const key = (i: SchematronIssue) =>
	[i.kind, i.id, i.role, i.location, i.test, i.text].join(" | ");
const xml = (dir: string) =>
	readdirSync(dir)
		.filter((f) => f.endsWith(".xml"))
		.sort();

for (const version of SUPPORTED_VERSIONS) {
	const root = specRoot(version);
	describe.skipIf(!root)(`Schematron (${version})`, () => {
		const base = root ?? "";
		const validators = {} as Record<DatasetName, SchematronValidator>;
		beforeAll(async () => {
			for (const d of DATASETS) {
				validators[d] = createSchematronValidator(
					readFileSync(await ensureCompiled(version, d), "utf8"),
				);
			}
		}, 600_000);

		for (const dataset of DATASETS) {
			const dir = join(base, "SampleData", "Schematron", SHORT[dataset]);
			const cases = root ? xml(join(dir, "xml")) : [];

			it(`${SHORT[dataset]}: has test cases with expected SVRL`, () => {
				expect(cases.length).toBeGreaterThan(15);
				expect(xml(join(dir, "svrl"))).toEqual(cases);
			});

			it.each(cases)(
				`${SHORT[dataset]}/%s matches the expected SVRL`,
				{ timeout: 60_000 },
				async (file) => {
					const result = await validators[dataset].validate(
						readFileSync(join(dir, "xml", file), "utf8"),
					);
					const expected = parseSvrl(
						readFileSync(join(dir, "svrl", file), "utf8"),
					);
					// Messages quoting the current time differ by nature (and by timezone format).
					const stable = (i: SchematronIssue) =>
						i.text.includes("the current time") ? { ...i, text: "" } : i;
					expect(result.issues.map(stable).map(key).sort()).toEqual(
						expected.map(stable).map(key).sort(),
					);
					expect(result.valid).toBe(
						!expected.some((i) => i.severity === "error"),
					);
				},
			);
		}

		const compliance = join(base, "Compliance", "Pre-Testing", "xml");
		const complianceCases = root
			? ["full", "national", "fail"].flatMap((d) =>
					xml(join(compliance, d)).map(
						(f) => [`${d}/${f}`, join(compliance, d, f)] as const,
					),
				)
			: [];
		it.each(complianceCases)(
			"compliance %s",
			{ timeout: 60_000 },
			async (name, path) => {
				const doc = readFileSync(path, "utf8");
				const dataset = DATASETS.find((d) =>
					doc.includes(`<${d}`),
				) as DatasetName;
				const result = await validators[dataset].validate(doc);
				if (name.includes("FailSchematron")) {
					expect(result.valid).toBe(false);
					expect(
						result.issues.filter((i) => i.severity === "error").length,
					).toBeGreaterThan(0);
				} else if (!name.includes("FailXsd")) {
					expect(result.issues.filter((i) => i.severity === "error")).toEqual(
						[],
					);
					expect(result.valid).toBe(true);
				}
			},
		);
	});
}
