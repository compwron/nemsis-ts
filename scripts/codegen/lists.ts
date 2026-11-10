/** Read NEMSIS `DefinedLists/<Name>/<Name>.xml` files (schema: `DefinedLists.xsd`). */
import { SaxesParser } from "saxes";
import type {
	DefinedList,
	DefinedListCode,
	DefinedListVocabulary,
} from "../../src/lists/types.ts";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Parse one defined-list XML document. Strict: unexpected structure throws. */
export function readDefinedList(xml: string, name: string): DefinedList {
	const parser = new SaxesParser({ position: true });
	const path: string[] = [];
	let text = "";
	let date = "";
	const vocabularies: Mutable<DefinedListVocabulary>[] = [];
	const types: string[] = [];
	const elements: string[] = [];
	const codes: Partial<Mutable<DefinedListCode>>[] = [];
	let valueCodeType: string | undefined;

	const fail = (message: string): never => {
		throw new Error(`${name}: ${message} (line ${parser.line})`);
	};
	const last = <T>(xs: T[]): T => xs[xs.length - 1] ?? fail("internal: empty");

	parser.on("error", (e) => fail(e.message));
	parser.on("doctype", () => fail("DOCTYPE is not allowed"));
	parser.on("opentag", (tag) => {
		path.push(tag.name);
		text = "";
		const here = path.join("/");
		const attrs = tag.attributes as Record<string, string>;
		if (here === "DefinedList") date = attrs.date ?? fail("missing date");
		else if (
			here === "DefinedList/Header/SourceVocabularies/SourceVocabulary"
		) {
			const v: Mutable<DefinedListVocabulary> = { name: "" };
			if (attrs.url !== undefined) v.url = attrs.url;
			if (attrs.CodeType !== undefined) v.codeType = attrs.CodeType;
			vocabularies.push(v);
		} else if (here === "DefinedList/Codes/Code") {
			codes.push({ date: attrs.date ?? fail("Code without date") });
		} else if (here === "DefinedList/Codes/Code/Value") {
			valueCodeType = attrs.CodeType;
		}
	});
	parser.on("text", (t) => {
		text += t;
	});
	parser.on("closetag", () => {
		const here = path.join("/");
		path.pop();
		switch (here) {
			case "DefinedList/Header/SourceVocabularies/SourceVocabulary":
				last(vocabularies).name = text;
				break;
			case "DefinedList/Header/NemsisTypes/NemsisType":
				types.push(text);
				break;
			case "DefinedList/Header/NemsisElements/NemsisElement":
				elements.push(text);
				break;
			case "DefinedList/Codes/Code/Value": {
				const c = last(codes);
				c.value = text;
				if (valueCodeType !== undefined) c.codeType = valueCodeType;
				break;
			}
			case "DefinedList/Codes/Code/Category":
				last(codes).category = text;
				break;
			case "DefinedList/Codes/Code/SourceLabel":
				last(codes).sourceLabel = text;
				break;
			case "DefinedList/Codes/Code/SuggestedLabel":
				last(codes).suggestedLabel = text;
				break;
			case "DefinedList/Codes/Code/Note":
				last(codes).note = text;
				break;
			case "DefinedList/Codes/Code": {
				const c = last(codes);
				if (
					c.value === undefined ||
					c.sourceLabel === undefined ||
					c.suggestedLabel === undefined
				)
					fail("Code is missing Value, SourceLabel or SuggestedLabel");
				break;
			}
			case "DefinedList":
			case "DefinedList/Header":
			case "DefinedList/Header/SourceVocabularies":
			case "DefinedList/Header/NemsisTypes":
			case "DefinedList/Header/NemsisElements":
			case "DefinedList/Codes":
				break;
			default:
				fail(`unexpected element <${here}>`);
		}
	});
	parser.write(xml).close();
	return {
		name,
		date,
		sourceVocabularies: vocabularies,
		nemsisTypes: types,
		nemsisElements: elements,
		codes: codes.map((c) => ({
			value: c.value as string,
			...(c.codeType === undefined ? {} : { codeType: c.codeType }),
			...(c.category === undefined ? {} : { category: c.category }),
			sourceLabel: c.sourceLabel as string,
			suggestedLabel: c.suggestedLabel as string,
			...(c.note === undefined ? {} : { note: c.note }),
			date: c.date as string,
		})),
	};
}
