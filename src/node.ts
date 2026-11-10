/** Node-only helpers (filesystem access). Import as `nemsis-ts/node`. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SchemaFile } from "./validate/xsd.ts";

/** Read every `.xsd` in `dir` (e.g. a NEMSIS release's `XSDs/NEMSIS_XSDs`), sorted by file name. */
export function loadSchemaFiles(dir: string): SchemaFile[] {
	return readdirSync(dir)
		.filter((f) => f.endsWith(".xsd"))
		.sort()
		.map((fileName) => ({
			fileName,
			contents: readFileSync(join(dir, fileName), "utf8"),
		}));
}
