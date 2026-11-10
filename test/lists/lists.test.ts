import { describe, expect, it } from "vitest";
import { readDefinedList } from "../../scripts/codegen/lists.ts";
import { createListIndex, type DefinedList } from "../../src/lists/index.ts";
import { definedLists as lists350 } from "../../src/lists/v3_5_0.ts";
import { definedLists as lists351 } from "../../src/lists/v3_5_1.ts";

const xml = (body: string, header = "") =>
	`<DefinedList xmlns="http://www.nemsis.org" date="2025-01-14"><Header>
		<SourceVocabularies><SourceVocabulary url="https://x/y" CodeType="9924003">RxNorm</SourceVocabulary><SourceVocabulary>Other</SourceVocabulary></SourceVocabularies>
		<NemsisTypes><NemsisType>T</NemsisType></NemsisTypes>
		<NemsisElements><NemsisElement>e.01</NemsisElement><NemsisElement>e.02</NemsisElement></NemsisElements>${header}
	</Header><Codes>${body}</Codes></DefinedList>`;

describe("readDefinedList", () => {
	it("reads header and codes, keeping optional fields only when present", () => {
		const list = readDefinedList(
			xml(`
				<Code date="2021-05-06"><Value CodeType="9924003">161</Value><Category>C</Category><SourceLabel>s</SourceLabel><SuggestedLabel>g</SuggestedLabel><Note>n</Note></Code>
				<Code date="2022-01-01"><Value>R10.0</Value><SourceLabel>s2</SourceLabel><SuggestedLabel>g2</SuggestedLabel></Code>`),
			"Demo",
		);
		expect(list).toEqual({
			name: "Demo",
			date: "2025-01-14",
			sourceVocabularies: [
				{ name: "RxNorm", url: "https://x/y", codeType: "9924003" },
				{ name: "Other" },
			],
			nemsisTypes: ["T"],
			nemsisElements: ["e.01", "e.02"],
			codes: [
				{
					value: "161",
					codeType: "9924003",
					category: "C",
					sourceLabel: "s",
					suggestedLabel: "g",
					note: "n",
					date: "2021-05-06",
				},
				{
					value: "R10.0",
					sourceLabel: "s2",
					suggestedLabel: "g2",
					date: "2022-01-01",
				},
			],
		});
	});

	it("is strict about structure", () => {
		const code = `<Code date="d"><Value>1</Value><SourceLabel>s</SourceLabel><SuggestedLabel>g</SuggestedLabel></Code>`;
		expect(() => readDefinedList("<DefinedList", "X")).toThrow(/^X: /);
		expect(() =>
			readDefinedList(`<!DOCTYPE a><DefinedList date="d"/>`, "X"),
		).toThrow(/DOCTYPE/);
		expect(() => readDefinedList(`<DefinedList/>`, "X")).toThrow(
			/missing date/,
		);
		expect(() =>
			readDefinedList(xml(`<Code><Value>1</Value></Code>`), "X"),
		).toThrow(/Code without date/);
		expect(() =>
			readDefinedList(xml(`<Code date="d"><Value>1</Value></Code>`), "X"),
		).toThrow(/missing Value, SourceLabel or SuggestedLabel/);
		expect(() => readDefinedList(xml(code, "<Extra/>"), "X")).toThrow(
			/unexpected element <DefinedList\/Header\/Extra>/,
		);
	});
});

describe("createListIndex", () => {
	const mk = (
		name: string,
		elements: string[],
		codes: [string, string?][],
	): DefinedList => ({
		name,
		date: "2025-01-14",
		sourceVocabularies: [],
		nemsisTypes: [],
		nemsisElements: elements,
		codes: codes.map(([value, codeType]) => ({
			value,
			...(codeType === undefined ? {} : { codeType }),
			sourceLabel: `s-${value}`,
			suggestedLabel: `g-${value}`,
			date: "2025-01-14",
		})),
	});
	const index = createListIndex([
		mk("A", ["x.01", "x.02"], [["1", "9924001"], ["1", "9924003"], ["2"]]),
		mk("B", ["x.02"], [["9"]]),
	]);

	it("finds lists by name and by element", () => {
		expect(index.list("A")?.name).toBe("A");
		expect(index.list("Z")).toBeUndefined();
		expect(index.listsForElement("x.02").map((l) => l.name)).toEqual([
			"A",
			"B",
		]);
		expect(index.listsForElement("x.01").map((l) => l.name)).toEqual(["A"]);
		expect(index.listsForElement("nope")).toEqual([]);
	});

	it("looks codes up, telling vocabularies apart by CodeType", () => {
		expect(index.lookup("A", "2")?.sourceLabel).toBe("s-2");
		expect(index.lookup("A", "1")?.codeType).toBe("9924001"); // first match when unspecified
		expect(index.lookup("A", "1", "9924003")?.codeType).toBe("9924003");
		expect(index.lookup("A", "1", "9924005")).toBeUndefined();
		expect(index.lookup("A", "2", "9924003")).toBeUndefined(); // 2 has no CodeType
		expect(index.lookup("A", "nope")).toBeUndefined();
		expect(index.lookup("Z", "1")).toBeUndefined();
	});

	it("finds a code through an element's lists", () => {
		expect(index.find("x.02", "9")).toMatchObject({
			list: { name: "B" },
			code: { value: "9" },
		});
		expect(index.find("x.02", "2")?.list.name).toBe("A");
		expect(index.find("x.01", "9")).toBeUndefined();
		expect(index.find("nope", "1")).toBeUndefined();
	});
});

describe("generated lists", () => {
	it.each([
		[
			"3.5.0",
			lists350,
			{
				CauseOfInjury: 83,
				Impression: 122,
				IncidentLocationType: 35,
				Medication: 70,
				Procedure: 114,
				Symptom: 124,
			},
		],
		[
			"3.5.1",
			lists351,
			{
				CauseOfInjury: 83,
				Impression: 122,
				IncidentLocationType: 35,
				Medication: 70,
				Procedure: 115,
				Symptom: 124,
			},
		],
	])("%s has all six lists with every code", (_v, index, counts) => {
		expect(
			Object.fromEntries(index.lists.map((l) => [l.name, l.codes.length])),
		).toEqual(counts);
	});

	it("maps elements to lists and resolves real codes", () => {
		expect(
			lists351.listsForElement("eSituation.09").map((l) => l.name),
		).toEqual(["Symptom"]);
		expect(
			lists351.listsForElement("eMedications.03").map((l) => l.name),
		).toEqual(["Medication"]);
		expect(
			lists351.find("eMedications.03", "161", "9924003")?.code.sourceLabel,
		).toBe("acetaminophen");
		expect(lists351.lookup("Symptom", "R10.0")).toMatchObject({
			category: "Abdominal",
			suggestedLabel: "Acute pain",
		});
	});

	it("3.5.1 added a Procedure code that 3.5.0 lacks", () => {
		const added =
			lists351
				.list("Procedure")
				?.codes.filter((c) => !lists350.lookup("Procedure", c.value)) ?? [];
		expect(added.map((c) => c.date)).toEqual(["2025-01-14"]);
	});
});
