/**
 * The small slice of SaxonJS (https://www.saxonica.com/saxonjs/) this package uses. SaxonJS is
 * an optional peer dependency under Saxonica's own license, so it is never bundled: Node loads
 * the `saxon-js` npm package on demand, and browsers can pass in `SaxonJS2.rt.js` themselves.
 */
export interface SaxonJS {
	transform(
		options: Record<string, unknown>,
		mode: "sync",
	): { principalResult: unknown };
	XPath: {
		evaluate(
			expression: string,
			context: null,
			options: { params: Record<string, unknown> },
		): unknown;
	};
	getProcessorInfo(): { productVersion: string };
}

const PACKAGE = "saxon-js";

/** Load the `saxon-js` npm package (Node). Throws a helpful error when it is not installed. */
export async function loadSaxon(): Promise<SaxonJS> {
	try {
		const mod = (await import(/* @vite-ignore */ PACKAGE)) as {
			default?: SaxonJS;
		} & SaxonJS;
		return mod.default ?? mod;
	} catch (e) {
		throw new Error(
			`Schematron validation needs the optional peer dependency "saxon-js" (npm i saxon-js), or pass { saxon } explicitly: ${(e as Error).message}`,
		);
	}
}
