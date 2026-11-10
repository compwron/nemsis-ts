/**
 * NEMSIS Schematron (business-rule) validation via SaxonJS. Import as `nemsis-ts/schematron`.
 * Compile the rules once with `compileSchematron` from `nemsis-ts/node`.
 */
export {
	SCHEMATRON_PATCHES,
	type SchematronPatch,
} from "./schematron/patches.ts";
export type { SaxonJS } from "./schematron/saxon.ts";
export {
	createSchematronValidator,
	parseSvrl,
	type SchematronIssue,
	type SchematronResult,
	type SchematronSeverity,
	type SchematronValidator,
	type SchematronValidatorOptions,
} from "./schematron/validate.ts";
