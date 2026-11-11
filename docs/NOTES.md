# Working notes

Running log of what was looked at and why, newest first. Facts only; decisions live in `PLAN.md` §8.

## 2026-11-10 — Dev Node 24 → 26

- Node release data (nodejs.org): 26 "Lithium" is Active LTS since 2026-10-28 (ends 2029-04-30); 24 and 22
  are Maintenance LTS (end 2028-04-30 and 2027-04-30); 20 is end of life.
- Dev Node is now 26.13.0 (`.tool-versions`), `@types/node` ^26, CI's single-version steps (bundled-XSD
  build, report upload, browser job) run on 26. `engines` stays `>=22` and the matrix stays 22/24/26, so
  the Node 22 job guards the floor. Raise the floor to 24 when Node 22 ends (2027-04-30).
- The dependabot ignore for major `@types/node` is removed again.
- Node 26 no longer ships corepack: locally run `npm install -g corepack` (then `asdf reshim nodejs`) to
  keep using `corepack pnpm`. CI uses pnpm/action-setup and is unaffected.
- Full suite, browser tests, build, bundle and package checks all pass on Node 26.13.0 locally.

## 2026-11-10 — Dependabot PRs

- #2 `actions/cache` 5.1.0 → 6.1.0: pin 55cc834… verified against the upstream `v6.1.0` tag; release only
  bumps its internal `@actions/cache`. Applied directly to `main` because the `gh` token lacks the
  `workflow` scope (it cannot merge PRs that touch workflow files); PR closed by dependabot.
- #1 `@types/node` 24 → 26: first held back (typings should track the dev Node), then applied by hand when
  the dev Node moved to 26 (see above); the temporary dependabot `ignore` was removed.
- #3 `tsdown` 0.23.4 → 0.23.5: held. Its lockfile swaps transitive `@yuku-core/*@0.19.0` for
  `@yuku-toolchain/*@0.25.0`, published 2026-11-10 — inside our 7-day `minimumReleaseAge`
  (dependabot's cooldown only covers the direct package). Revisit on or after 2026-11-17.

## 2026-11-10 — Defined lists (Milestone 7)

**Looked at**
- `DefinedLists/` in both tags: six lists (CauseOfInjury, Impression, IncidentLocationType, Medication,
  Procedure, Symptom), each as XML/JSON/CSV/XLSX, plus `DefinedLists.xsd`. About 150 KB per version as JSON.
- 3.5.0 vs 3.5.1: same lists, same elements; 3.5.1 adds one Procedure code (116859006, dated 2025-01-14),
  updated source URLs, and widens the list-level value type from 15 to 18 characters.
- Upstream inconsistencies between the renderings: see PLAN §9.
- Elements mapped: eSituation.09/.10 → Symptom, eSituation.11/.12 → Impression, eMedications.03 and the
  dConfiguration/sConfiguration equivalents → Medication, and so on.

**Decisions:** lists live behind `nemsis-ts/<version>/lists` (about 110 KiB each) so the version entry stays
unchanged. Generated from the XML only; JSON and CSV are test oracles.

## 2026-11-10 — SaxonJS bugs, CI limits

**Looked at**
- npm `saxon-js`: 2.7.0 is still the latest (2.5.0, 2.6.0, 2.7.0 listed). Both bugs reproduce on it.
- Saxonica tracker (saxonica.plan.io) via web search: no existing issue for either bug. Closest hits were
  unrelated (#4820 sequence cardinality in `castable`, #4936 and #6343 not on point).
- CI run 42758248380 (commit 4bfa3d2): test jobs took 366 s (Node 22), 425 s (Node 24), 415 s (Node 26);
  browser job 51 s. That run had a cold Schematron cache, so it includes compiling.

**Not done: filing the two Saxonica issues.** Filing needs an account on saxonica.plan.io and would be posted
under the user's name, so the drafts below are for the user to paste. Reproduction script:
`repro-saxonjs.mjs` is not committed; the examples below are self-contained.

### Draft 1 — `castable as xs:integer` / `xs:integer()` fail on whitespace-padded strings longer than 9 characters

SaxonJS 2.7.0, Node.js. `xs:integer` has `whiteSpace="collapse"`, so surrounding whitespace must be ignored.
It is for short strings; once the raw string (whitespace included) is longer than 9 characters, `castable as`
returns false and `xs:integer()` throws an error whose message is just `NaN` (no error code).

```js
const SaxonJS = require("saxon-js");
const t = (e, s) => {
	try {
		return String(SaxonJS.XPath.evaluate(e, null, { params: { s } }));
	} catch (x) {
		return "ERROR " + x.message;
	}
};
for (const s of [
	"191      ",
	"191       ",
	"       191",
	"1234567890",
	" 1234567890 ",
])
	console.log(
		JSON.stringify(s),
		t("$s castable as xs:integer", s),
		t("string(xs:integer($s))", s),
	);
```
Observed: `"191      "` true/191, then `"191       "`, `"       191"`, `" 1234567890 "` false/`ERROR NaN`.
Expected: true and the integer in every case (as Saxon on Java). Impact: indented element content such as
`<v>191\n    </v>` is wrongly "not castable", so Schematron rules like `. castable as xs:integer` misfire.
Workaround: `normalize-space(.) castable as xs:integer`.

### Draft 2 — `format-dateTime()` with `[ZN]` throws "Timezone names not implemented"

SaxonJS 2.7.0, Node.js.
```js
SaxonJS.XPath.evaluate(
	"format-dateTime(xs:dateTime('2025-01-01T12:00:00-05:00'), '[H01]:[m01] [ZN]')",
);
// XError SXJS0002: Timezone names not implemented
```
Expected: no dynamic error (Saxon on Java outputs a name; the numeric offset would be an acceptable fallback).
Impact: a stylesheet that works on Saxon for Java crashes. Workaround: `[Z]`.
Check the F&O wording on the `N` modifier's fallback before posting.

**CI job limit.** Max observed test-job time is about 7 minutes, so the 15-minute `timeout-minutes` on the
`test` job (restored from 25) leaves about 2x headroom. Details of GitHub's limits are in the commit message /
conversation; re-check against GitHub's current billing docs before relying on them.
