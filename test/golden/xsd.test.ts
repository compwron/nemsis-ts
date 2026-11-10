/**
 * XSD validation against the official NEMSIS compliance pre-testing cases and sample data:
 * valid documents pass, `*FailXsd*` documents fail with element-level errors, and
 * `*FailSchematron*` documents pass XSD (they only break business rules).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_VERSIONS } from "../../src/index.ts";
import { loadSchemaFiles } from "../../src/node.ts";
import { createXsdValidator } from "../../src/validate/xsd.ts";
import { specRoot } from "../support/spec.ts";

const files = (dir: string) =>
	readdirSync(dir)
		.filter((f) => f.endsWith(".xml"))
		.sort()
		.map((f) => [f, join(dir, f)] as const);

for (const version of SUPPORTED_VERSIONS) {
	const root = specRoot(version);
	describe.skipIf(!root)(`XSD validation (${version})`, () => {
		const base = root ?? "";
		const validator = createXsdValidator(
			loadSchemaFiles(join(base, "XSDs", "NEMSIS_XSDs")),
		);
		const compliance = join(base, "Compliance", "Pre-Testing", "xml");

		describe("compliance cases that must pass", () => {
			const cases = [
				...files(join(compliance, "full")).map(
					([f, p]) => [`full/${f}`, p] as const,
				),
				...files(join(compliance, "national")).map(
					([f, p]) => [`national/${f}`, p] as const,
				),
				...files(join(compliance, "fail"))
					.filter(([f]) => f.includes("FailSchematron"))
					.map(([f, p]) => [`fail/${f}`, p] as const),
			];

			it.each(cases)("%s", async (_name, path) => {
				const result = await validator.validate(readFileSync(path, "utf8"));
				expect(result.errors).toEqual([]);
				expect(result.valid).toBe(true);
			});
		});

		describe("compliance cases that must fail XSD", () => {
			const cases = files(join(compliance, "fail")).filter(([f]) =>
				f.includes("FailXsd"),
			);

			it("has both a DEM and an EMS case", () => {
				expect(cases.map(([f]) => f.split("-")[1]).sort()).toEqual([
					"DEM",
					"EMS",
				]);
			});

			it.each(cases)("%s", async (name, path) => {
				const result = await validator.validate(readFileSync(path, "utf8"));
				expect(result.valid).toBe(false);
				expect(result.dataset).toBe(
					name.includes("-DEM-") ? "DEMDataSet" : "EMSDataSet",
				);
				expect(result.errors.length).toBeGreaterThan(0);
				for (const e of result.errors) {
					expect(e.line).toBeGreaterThan(0);
					expect(e.element).toMatch(/^[A-Za-z]+(\.[A-Za-z0-9]+)?$/);
				}
			});
		});

		describe("sample data", () => {
			const cases = ["EMS", "DEM", "State"].flatMap((d) =>
				files(join(base, "SampleData", d, "xml")).map(
					([f, p]) => [`${d}/${f}`, p] as const,
				),
			);

			it("covers all three datasets", () => {
				expect(cases.length).toBe(110);
			});

			it.each(cases)("%s", async (name, path) => {
				const result = await validator.validate(readFileSync(path, "utf8"));
				if (name.startsWith("EMS/")) {
					// Known upstream defect: the EMS sample data predates the Oct 2025 change that made
					// ePatient.25 (Sex) mandatory, so every EMS sample lacks it. Pin exactly that one
					// error, so this fails if NEMSIS fixes the samples or anything else breaks.
					expect(result.errors).toEqual([
						{
							line: expect.any(Number),
							element: "ePatient",
							message: expect.stringMatching(
								/Missing child element\(s\)\. Expected is .*ePatient\.25 \)\.$/,
							),
						},
					]);
				} else {
					expect(result.errors).toEqual([]);
				}
			});
		});
	});
}
