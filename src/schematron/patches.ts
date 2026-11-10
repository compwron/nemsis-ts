/**
 * Source-level workarounds applied to the XSLT that the ISO Schematron skeleton generates from
 * the NEMSIS rules, for SaxonJS 2.x gaps. Each one keeps the rule's meaning; each is checked by
 * the golden tests against NEMSIS's own expected SVRL (produced with Saxon on Java).
 */
export interface SchematronPatch {
	readonly id: string;
	readonly reason: string;
	readonly find: string;
	readonly replace: string;
}

export const SCHEMATRON_PATCHES: readonly SchematronPatch[] = [
	{
		id: "integer-castable-whitespace",
		reason:
			"SaxonJS 2.7 does not collapse whitespace before casting long strings (>9 characters) to xs:integer, so '191' followed by a newline and indentation is wrongly not castable. normalize-space() applies the same whitespace collapse XSD requires (nemSch_e133).",
		// Only the evaluated condition: the SVRL keeps reporting the rule's test as written.
		find: '<xsl:when test=". castable as xs:integer',
		replace: '<xsl:when test="normalize-space(.) castable as xs:integer',
	},
	{
		id: "timezone-name",
		reason:
			"SaxonJS 2.7 does not implement timezone names ([ZN]) in format-dateTime(); use the numeric offset ([Z]). Only affects message text (nemSch_e056 and similar 'in the future' warnings).",
		find: " [ZN]'",
		replace: " [Z]'",
	},
];

/** Apply {@link SCHEMATRON_PATCHES}; returns the patched XSLT and how often each patch applied. */
export function patchCompiledSchematron(xsl: string): {
	xsl: string;
	applied: Record<string, number>;
} {
	const applied: Record<string, number> = {};
	let out = xsl;
	for (const p of SCHEMATRON_PATCHES) {
		const parts = out.split(p.find);
		applied[p.id] = parts.length - 1;
		out = parts.join(p.replace);
	}
	return { xsl: out, applied };
}
