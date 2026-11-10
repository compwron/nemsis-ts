/**
 * Type-level tests for the generated document types. These are enforced by `pnpm typecheck`
 * (`@ts-expect-error` lines must fail to compile); the runtime assertions are incidental.
 */
import { describe, expectTypeOf, it } from "vitest";
import type { v3_5_0, v3_5_1 } from "../../src/index.ts";

type VitalGroup = v3_5_1.EMS.EVitalsVitalGroup;
type SBP = v3_5_1.EMS.EVitalsBloodPressureGroup["eVitals.06"];

describe("generated document types (3.5.1)", () => {
	it("types a nillable leaf with NV / PN as value-or-nil plus attributes", () => {
		const measured: SBP = { value: "120" };
		const notRecorded: SBP = { nil: true, NV: "7701003" };
		const refused: SBP = { nil: true, PN: "8801019" };
		// @ts-expect-error eVitals.06 allows only NV.NotApplicable / NV.NotRecorded
		const notReporting: SBP = { nil: true, NV: "7701005" };
		// @ts-expect-error a value and nil are mutually exclusive
		const both: SBP = { value: "120", nil: true };
		// @ts-expect-error a leaf needs a value or nil
		const neither: SBP = { NV: "7701003" };
		expectTypeOf([
			measured,
			notRecorded,
			refused,
			notReporting,
			both,
			neither,
		]).toBeArray();
	});

	it("types enumerated simple types as unions of their codes", () => {
		expectTypeOf<v3_5_1.codes.YesNoValues>().toEqualTypeOf<
			"9923001" | "9923003"
		>();
		expectTypeOf<v3_5_1.codes.NV_NotRecorded>().toEqualTypeOf<"7701003">();
		const sex: v3_5_1.EMS.EPatient["ePatient.25"] = { value: "9919001" };
		// @ts-expect-error not a Sex code
		const notSex: v3_5_1.EMS.EPatient["ePatient.25"] = { value: "female" };
		expectTypeOf([sex, notSex]).toBeArray();
	});

	it("types plain leaves (no attributes, not nillable) as their simple type", () => {
		expectTypeOf<
			v3_5_1.EMS.ETimes["eTimes.03"]
		>().toEqualTypeOf<v3_5_1.codes.DateTimeType>();
		expectTypeOf<v3_5_1.codes.DateTimeType>().toEqualTypeOf<string>();
	});

	it("types repeating elements as arrays and minOccurs=0 elements as optional", () => {
		expectTypeOf<v3_5_1.EMS.EVitals["eVitals.VitalGroup"]>().toEqualTypeOf<
			VitalGroup[]
		>();
		expectTypeOf<
			VitalGroup["eVitals.BloodPressureGroup"]
		>().toEqualTypeOf<v3_5_1.EMS.EVitalsBloodPressureGroup>();
		expectTypeOf<v3_5_1.EMS.PatientCareReport>().toHaveProperty("eVitals");
		expectTypeOf<v3_5_1.EMS.Header["eCustomConfiguration"]>().toEqualTypeOf<
			v3_5_1.EMS.ECustomConfiguration | undefined
		>();
	});

	it("puts group attributes on the group object", () => {
		expectTypeOf<VitalGroup["CorrelationID"]>().toEqualTypeOf<
			v3_5_1.codes.CorrelationID | undefined
		>();
		expectTypeOf<
			v3_5_1.EMS.PatientCareReport["UUID"]
		>().toEqualTypeOf<v3_5_1.codes.UUID>();
	});

	it("exposes each dataset root", () => {
		expectTypeOf<v3_5_1.EMS.EMSDataSet["Header"]>().toEqualTypeOf<
			v3_5_1.EMS.Header[]
		>();
		expectTypeOf<v3_5_1.DEM.DEMDataSet>().toBeObject();
		expectTypeOf<v3_5_1.State.StateDataSet>().toBeObject();
		expectTypeOf<v3_5_0.EMS.EMSDataSet>().toBeObject();
	});
});
