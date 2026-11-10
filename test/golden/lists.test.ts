/**
 * Defined lists: the XML we generate from must agree with NEMSIS's own JSON and CSV renderings
 * of the same list, and every list must line up with the schema (its elements exist, its types
 * match the elements' types, and each code satisfies those types' facets).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDefinedList } from "../../scripts/codegen/lists.ts";
import { schemas } from "../../src/generated/index.ts";
import {
	effectiveFacets,
	leaves,
	SUPPORTED_VERSIONS,
} from "../../src/index.ts";
import type { DefinedList } from "../../src/lists/types.ts";
import { specRoot } from "../support/spec.ts";

/** Minimal RFC 4180 reader for NEMSIS's CSV (all fields quoted, trailing comma). */
function readCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			if (field !== "" || row.length) row.push(field);
			if (row.length) rows.push(row);
			row = [];
			field = "";
		} else field += c;
	}
	if (field !== "" || row.length) rows.push([...row, field]);
	return rows;
}

/** NEMSIS CSVs name the vocabulary where the XML/JSON carry its CodeType. */
const CODE_TYPE_BY_VOCABULARY: Record<string, string> = {
	"ICD-10": "9924001",
	RxNorm: "9924003",
	"SNOMED-CT": "9924005",
};

/** 3.5.0 CSVs use M/D/YYYY; 3.5.1 uses ISO dates. */
const isoDate = (s: string) => {
	const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
	return m
		? `${m[3]}-${(m[1] ?? "").padStart(2, "0")}-${(m[2] ?? "").padStart(2, "0")}`
		: s;
};

/**
 * Known upstream inconsistencies (see docs/PLAN.md §9), pinned exactly so a NEMSIS fix shows up:
 * in 3.5.0 the XML of these lists carries a newer list-level date than their JSON.
 */
const STALE_JSON_DATE: Record<string, string> = {
	"3.5.0.251001CP6/CauseOfInjury": "2023-02-14",
	"3.5.0.251001CP6/Medication": "2023-02-14",
};

for (const version of SUPPORTED_VERSIONS) {
	const root = specRoot(version);
	describe.skipIf(!root)(`defined lists (${version})`, () => {
		const dir = join(root ?? "", "DefinedLists");
		const names = root
			? readdirSync(dir, { withFileTypes: true })
					.filter((d) => d.isDirectory())
					.map((d) => d.name)
					.sort()
			: [];
		const schema = schemas[version];
		const elements = new Map(
			Object.values(schema.datasets).flatMap((ds) =>
				[...leaves(ds)].map((l) => [l.name, l] as const),
			),
		);

		it("has the six official lists", () => {
			expect(names).toEqual([
				"CauseOfInjury",
				"Impression",
				"IncidentLocationType",
				"Medication",
				"Procedure",
				"Symptom",
			]);
		});

		describe.each(names)("%s", (name) => {
			const list: DefinedList = readDefinedList(
				readFileSync(join(dir, name, `${name}.xml`), "utf8"),
				name,
			);

			it("is identical to NEMSIS's JSON rendering", () => {
				const json = JSON.parse(
					readFileSync(join(dir, name, `${name}.json`), "utf8"),
				).DefinedList;
				expect(json.date).toBe(
					STALE_JSON_DATE[`${version}/${name}`] ?? list.date,
				);
				expect(list.sourceVocabularies).toEqual(
					json.Header.SourceVocabularies.SourceVocabulary.map(
						(v: { Value: string; url?: string; CodeType?: string }) => ({
							name: v.Value,
							...(v.url === undefined ? {} : { url: v.url }),
							...(v.CodeType === undefined ? {} : { codeType: v.CodeType }),
						}),
					),
				);
				expect(list.nemsisTypes).toEqual(json.Header.NemsisTypes.NemsisType);
				expect(list.nemsisElements).toEqual(
					json.Header.NemsisElements.NemsisElement,
				);
				expect(list.codes).toEqual(
					json.Codes.Code.map(
						(c: {
							Value: { Value: string; CodeType?: string };
							Category?: string;
							SourceLabel: string;
							SuggestedLabel: string;
							Note?: string;
							date: string;
						}) => ({
							value: c.Value.Value,
							...(c.Value.CodeType === undefined
								? {}
								: { codeType: c.Value.CodeType }),
							...(c.Category === undefined ? {} : { category: c.Category }),
							sourceLabel: c.SourceLabel,
							suggestedLabel: c.SuggestedLabel,
							...(c.Note === undefined ? {} : { note: c.Note }),
							date: c.date,
						}),
					),
				);
			});

			it("is identical to NEMSIS's CSV rendering", () => {
				const [header, ...rows] = readCsv(
					readFileSync(join(dir, name, `${name}.csv`), "utf8"),
				);
				expect(header?.filter((h) => h !== "")).toEqual([
					"Value",
					"CodeType",
					"Category",
					"SourceLabel",
					"SuggestedLabel",
					"Note",
					"Date",
				]);
				const vocabulary = (codeType: string | undefined) =>
					codeType === undefined
						? ""
						: (Object.entries(CODE_TYPE_BY_VOCABULARY).find(
								([, v]) => v === codeType,
							)?.[0] ?? codeType);
				expect(
					rows.map((r) => [...r.slice(0, 6), isoDate(r[6] ?? "")]),
				).toEqual(
					list.codes.map((c) => [
						c.value,
						vocabulary(c.codeType),
						c.category ?? "",
						c.sourceLabel,
						c.suggestedLabel,
						c.note ?? "",
						c.date,
					]),
				);
			});

			it("has unique codes", () => {
				const keys = list.codes.map((c) => `${c.codeType ?? ""}|${c.value}`);
				expect(new Set(keys).size).toBe(keys.length);
			});

			it("lines up with the schema: elements exist, types match, codes satisfy the facets", () => {
				for (const e of list.nemsisElements) {
					const leaf = elements.get(e);
					expect(leaf, `${name}: element ${e}`).toBeDefined();
					expect(list.nemsisTypes, `${name}: type of ${e}`).toContain(
						leaf?.type,
					);
				}
				for (const t of list.nemsisTypes)
					expect(schema.simpleTypes[t], `${name}: type ${t}`).toBeDefined();
				for (const t of list.nemsisTypes) {
					const f = effectiveFacets(schema.simpleTypes, t);
					for (const c of list.codes) {
						const where = `${name}/${t}: ${c.value}`;
						if (f.maxLength !== undefined)
							expect(c.value.length, where).toBeLessThanOrEqual(f.maxLength);
						if (f.minLength !== undefined)
							expect(c.value.length, where).toBeGreaterThanOrEqual(f.minLength);
						for (const p of f.pattern ?? [])
							expect(new RegExp(`^(?:${p})$`).test(c.value), where).toBe(true);
					}
				}
			});
		});
	});
}
