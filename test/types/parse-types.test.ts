/** `parse` from a version entry returns a dataset-discriminated, fully typed result. */
import { describe, expect, expectTypeOf, it } from "vitest";
import { parse as parse350 } from "../../src/3.5.0.ts";
import {
	type DEM,
	type EMS,
	NemsisParseError,
	type ParseResult,
	parse,
} from "../../src/3.5.1.ts";
import type { v3_5_0 } from "../../src/index.ts";

const xml = `<EMSDataSet xmlns="http://www.nemsis.org"><Header/></EMSDataSet>`;

describe("typed parse (3.5.1)", () => {
	it("narrows the document by dataset", () => {
		const result: ParseResult = parse(xml);
		if (result.dataset === "EMSDataSet") {
			expectTypeOf(result.document).toEqualTypeOf<EMS.EMSDataSet>();
			expectTypeOf(result.document.Header).toEqualTypeOf<EMS.Header[]>();
		} else if (result.dataset === "DEMDataSet") {
			expectTypeOf(result.document).toEqualTypeOf<DEM.DEMDataSet>();
		}
		expect(result.dataset).toBe("EMSDataSet");
		// @ts-expect-error the document type depends on the dataset
		const header: EMS.Header[] = result.document.Header;
		expect(header).toEqual([{}]);
	});

	it("each version entry parses into its own version's types", () => {
		const r = parse350(xml);
		if (r.dataset === "EMSDataSet")
			expectTypeOf(r.document).toEqualTypeOf<v3_5_0.EMS.EMSDataSet>();
		expect(r.issues.length).toBeGreaterThan(0); // the minimal document lacks required content
	});

	it("exposes NemsisParseError for malformed input", () => {
		expect(() => parse("<EMSDataSet")).toThrow(NemsisParseError);
	});
});
