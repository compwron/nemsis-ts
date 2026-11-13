# Working notes

Running log of what was looked at and why, newest first. Facts only; decisions live in `PLAN.md` §8.

## 2026-11-12 — History rewrite (commit email)

- At the owner's request, rewrote all 36 commits' author/committer email to GitHub's `noreply` address
  (`git filter-branch`, file contents unchanged), force-pushed `main`, and deleted the three Dependabot branches
  (their PRs #1-#4 are closed; Dependabot should recreate). Backup bundle of the old history was kept in the
  session scratch directory only. Repo-local `user.email` set to the noreply address.

## 2026-11-12 — FHIR mapping: review passes, verification, release plan

- Per-element review for ePatient, eVitals, eMedications, then the shell, clinical context, disposition and
  payment, in `docs/FHIR-MAPPING.md`. Owner decisions recorded there (both directions, both realms, hybrid
  validation, extensions in a namespace we control, eProcedures undecided).
- Verified against hl7.org page text: vital-sign LOINC codes, six code-system URIs, US Core 9.0.0 profile names.
  Not verified: ICD-10-CM and SSN URIs, other LOINC codes. No code written.
- Public-readiness audit and a 0.0.1 plan added to `docs/RELEASING.md`. Found: owner's commit email is in all
  git history. Nothing published, nothing made public.

## 2026-11-12 — FHIR (IHE mPSC) mapping: read the IG

- Read the mPSC `2.0.0-draft` CI build (generated 2025-10-30): only 27 of about 390 NEMSIS elements have a
  FHIR path (dAgency, eCustomConfiguration, eOutcome deferred to an absent "QORE Profile"). No clinical
  sections are mapped. Wrote `docs/FHIR-MAPPING.md` as a proposal with open questions; no code. Waiting on the
  owner to agree scope before anything else. Page text only; the package was not downloaded.

## 2026-11-12 — Handoff file

- Added `docs/HANDOFF.md` (state, working agreements, pitfalls, blockers, ordered next steps) and a memory
  pointer to it, so a fresh session can pick up without the conversation history.

## 2026-11-12 — Web-service (SOAP) client, `nemsis-ts/ws`

**Looked at**
- `WSDL/NEMSIS_V3_core.wsdl` (same bytes in both tags): operations SubmitData / RetrieveStatus / QueryLimit,
  SOAP 1.1 document/literal, namespace `http://ws.nemsis.org/`, `soapAction=http://ws.nemsis.org/<op>`,
  default address `https://validator.nemsis.org/`. Credentials (username 1-100, password 1-250,
  organization 1-100 chars) travel in the request body; `additionalInfo` is required in SubmitData and
  RetrieveStatus requests.
- `NEMSIS_v3_WebServices.pdf` (3.5.1 tag only; 3.5.0 has none). No PDF tools here, so I extracted its text by
  inflating the PDF streams with a short Python script (scratch, not committed). Useful facts: HTTPS
  required (TLS 1.2 must, 1.3 should); sample `schemaVersion` is `3.5.0`; sample requests/responses; async
  flow (status 0 + handle, then RetrieveStatus); the national registry keeps results ~6 months; WS-Security
  headers are allowed but unspecified.
- Not run: any live server (no account). Nothing was sent anywhere.

**Decisions:** only `fetch` + `saxes` (no SOAP library). HTTPS only (HTTP for localhost or explicit opt-in);
`redirect: "error"` because credentials are in the POST body; no credential ever in an error message or
snippet; fetch injectable for tests/proxies. Status table hand-written, cross-checked against the WSDL by a
golden test. Responses are parsed leniently (an absent `xmlValidationErrorReport` is accepted; the WSDL
requires it) because real servers vary; requests are strict.

## 2026-11-11 — CI browser job: Chromium install failed on runner DNS

- The browser job failed at `playwright install --with-deps` on the Milestone 8 prep commit, three reruns
  in a row over ~30 min: `Temporary failure resolving 'archive.ubuntu.com'` (and the other Ubuntu mirrors),
  then apt exit 100. Node jobs were fine. The same image (`ubuntu-26.04`) had passed the job hours earlier;
  githubstatus.com showed no incident; the mirrors resolved instantly from the dev machine. So: the
  runner's DNS, not our code.
- A retry loop with `Acquire::Retries 5` made it worse (each attempt took ~10 min, and the 15 min job limit
  cancelled the job). Replaced by `playwright install chromium` without `--with-deps`: the runner image
  already has Chrome's libraries, and the job passed. If a future image lacks a library, the browser test
  step fails with the missing-library error; then reinstate `--with-deps` (maybe with a container).
- `npm view nemsis-ts` (run at the maintainer's request): 404, name unclaimed on 2026-11-11.

## 2026-11-11 — Milestone 8 preparation (no publishing)

- Initially not run: `npm view nemsis-ts` (repo private, maintainers waiting on external discussions, so I
  did not send the intended name to a third party unasked). Run later at the maintainer's request: see the
  CI entry above.
- `pnpm pack --dry-run`: tarball is `dist/`, `LICENSE`, `README.md`, `package.json` only (no `.spec`, tests
  or generated sources).
- Added: README examples type-checked by a test (mutation-checked with a bad property and a misspelled
  import path), `CHANGELOG.md`, `release.yml` (manual only; skipped unless `RELEASE_ENABLED=true`; refuses
  while `private` or version `0.0.0`; uses OIDC trusted publishing + `--provenance`; actions SHA-pinned as in
  CI), `docs/RELEASING.md`, and `"private": true` in `package.json` as the safety lock.
- Provenance needs a public repo; the dry-run path (`npm publish --dry-run`) is the only part exercised in CI
  once enabled. Not tested here: the workflow itself has never run.

## 2026-11-11 — fast-xml-parser: runtime → dev dependency, 5.12.0

- Dependabot #4 bumped `fast-xml-parser` 5.11.2 → 5.12.0 (minor; fixes only, no new transitive packages).
  Its CI was red only because its branch predated the tag re-pin below.
- It was listed under `dependencies` but nothing shipped uses it (since parsing moved to `saxes`): only
  `scripts/codegen/xsd.ts` and the tests (as the independent oracle). Moved to `devDependencies` at 5.12.0,
  which supersedes #4.

## 2026-11-11 — Upstream moved the pinned release tags

- CI on the Node 26 commit failed at `spec:fetch`: tag `3.5.0.251001CP6` now resolves to `127d820…`
  (lock: `af3ea23…`). `git ls-remote` showed `3.5.1.251001CP2` also moved (`0735934…` vs `ef8dfef…`).
  Not related to the Node change: the CI cache key changed (lockfile is in it), so CI refetched for the
  first time since the tags moved.
- Fetched both new commits to a temp dir and diffed against our manifests: 3.5.0 differs only in
  `DefinedLists/DefinedListHtml.xsl`; 3.5.1 also swaps the 17 `2025-*` compliance cases for `2026-*` ones.
  Codegen output differs only in the header comment (commit SHA), so XSDs and lists are unchanged.
- Old commits were still fetchable by SHA (checked with a throwaway repo). Not relied upon.
- Re-pinned the lock and manifests, regenerated, fixed tests that named the 2025 files, pinned the exact
  FailXsd errors per file (3.5.0: 152 dConfiguration.02 / 120 eSituation; 3.5.1: 1218 dPersonnel.10 /
  50 eResponse.16), made the bundle check find its sample by pattern. A parse-golden comparison that
  depended on attribute order was fixed; a Schematron test that depended on a prior compile was removed.

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
