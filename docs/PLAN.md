# Build plan

Status: draft, 2026-11-09. Scope for now is **NEMSIS v3.5 read/write/validate**. X12 and FHIR come
after this core is solid (see [README](../README.md)).

## 1. Definitive sources (verified 2026-11-09)

The canonical source is NEMSIS TAC's public git repository, not the website zips:

- **Repo:** `https://git.nemsis.org/scm/nep/nemsis_public.git` (Bitbucket, anonymous clone works)
- **Release tags:** every published version is tagged, e.g. `3.5.1.251001CP2`, `3.5.0.251001CP6`.
  The default branch is in-progress work (it moved today) and **must not** be built against.
- **Target versions:** both `3.5.1.251001CP2` (tag commit `ef8dfefbb0481eeb1715880b8c806d50f21e1c28`,
  2025-10-08, the newest 3.5.1 release) and `3.5.0.251001CP6` (the newest 3.5.0 release). Generated code
  lives per version. v3.5.2 is scoped but not released yet
  ([timeline](https://nemsis.org/wp-content/uploads/2026/10/NEMSIS-v3.5.2-Timeline.pdf)).
- **Cross-check against the website:** the
  [XSD zip](https://nemsis.org/media/nemsis_v3/release-3.5.1/XSDs/NEMSIS_XSDs.zip), the national
  `EMSDataSet.sch` and `NEMSIS_V3_core.wsdl` match the tag, apart from CRLF line endings and one explicit
  `minOccurs="1"` (`ePatient.25`), which is the default anyway. The tag's `schemaLocation`s also point at a
  version-pinned URL (`https://nemsis.org/media/nemsis_v3/3.5.1.251001CP2/...`), which resolves.

What's in the tag and what we use it for:

| Path in `nemsis_public`                                  | What it is                                                                                                                                 | Our use                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `XSDs/NEMSIS_XSDs/`                                      | 47 XSDs, namespace `http://www.nemsis.org`. Entry points `EMSDataSet_v3.xsd`, `DEMDataSet_v3.xsd`, `StateDataSet_v3.xsd`, all `xs:include` | **Primary definition.** Code generation and XSD validation |
| `XSDs/NEMSIS_NAT_XSDs/`, `NEMSIS_EMS_XSDs/`, …           | Subset XSDs (national-only elements, etc.)                                                                                                 | Later: "national-elements-only" profile                    |
| `Schematron/rules/{EMS,DEM,State}DataSet.sch`            | National ISO Schematron, **`queryBinding="xslt2"`**                                                                                        | Business-rule validation                                   |
| `Schematron/DevelopmentKit/`                             | Reference ISO Schematron XSLT2 skeleton, test harness, SVRL schema                                                                         | How to compile `.sch` → XSLT                               |
| `SampleData/Schematron/{EMS,DEM,State}/`                 | `Tests.txt` + `xml/` + expected `svrl/`                                                                                                    | **Golden tests** for the Schematron runner                 |
| `Compliance/Pre-Testing/xml/{full,national,fail}/`       | 2025 compliance test cases (`*-FailXsd_*`, `*-FailSchematron_*`)                                                                           | **Golden tests**: valid docs round-trip, fail docs fail    |
| `SampleData/{EMS,DEM,State}/xml/`                        | `*-ElementsRepeat-N.xml` and similar samples (≈41 MB total)                                                                                | Round-trip and fuzz corpus                                 |
| `DataDictionary/Ancillary/DEMEMS/*.txt`                  | Pipe-delimited element details (usage, min/max occurs, NV/PN, patterns)                                                                    | **Independent oracle** for codegen metadata                |
| `DefinedLists/`                                          | Value lists (Impression, Medication, …) as CSV/JSON/XSD                                                                                    | Code-set lookups                                           |
| `WSDL/NEMSIS_V3_core.wsdl` + `NEMSIS_v3_WebServices.pdf` | SOAP service (`ws.nemsis.org`), operations `SubmitData`, `RetrieveStatus`, `QueryLimit`                                                    | Later: typed web-service client                            |

Online oracles: `https://validator.nemsis.org/nemsisWs.wsdl` (validator) and
`https://compliance.nemsis.org/nemsisWs.wsdl` (compliance). These are external services, so we only send
them official sample files, and only from an opt-in workflow.

**Licensing note.** None of these files states a license (only "provided by the NEMSIS TAC, without
charge"). Until that's clarified, **we don't commit NEMSIS files to this repo.** A pinned fetch script
downloads them, and only our generated code is committed. Open question: ask NEMSIS TAC whether
redistribution is allowed.

**X12 (later).** The definitive 837P/835 specs are the X12 TR3 implementation guides (`005010X222A1`,
`005010X221A1`). They're copyrighted and paid, so they can't be vendored. We'd build from licensed copies
plus free payer/CMS companion guides.

## 2. Clean-room rules

- Inputs are only official NEMSIS artifacts, public standards and our own tests.
- We don't read or copy source from peak-server, emberstone or other GPL/AGPL implementations while
  implementing. Pointing to their _existence_ in docs is fine.
- Every commit is our own work. PR template includes a checkbox: "No code derived from copyleft sources."

## 3. Tooling

| Concern               | Choice                                                                                                                                                                        | Why                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Runtime               | Node 22 / 24 / 26 in CI, ESM-first, browser-safe core                                                                                                                         | Current LTS lines                              |
| Package manager       | pnpm (via corepack)                                                                                                                                                           | Fast, strict                                   |
| Language              | TypeScript, `strict`, `exactOptionalPropertyTypes`                                                                                                                            | NV/PN/nil need careful optionality             |
| Tests                 | Vitest (+ `@vitest/coverage-v8`)                                                                                                                                              | Fast TDD watch loop, native ESM/TS             |
| Lint/format           | Biome                                                                                                                                                                         | One tool, no config sprawl                     |
| Build                 | tsdown (or tsup) → ESM + `.d.ts`; check with `publint` + `@arethetypeswrong/cli`                                                                                              | Correct package exports                        |
| XML parse/build       | `saxes` (streaming, namespace-aware, keeps exact text) for parse; `fast-xml-parser` only as an independent test oracle                                                        | NEMSIS is order-sensitive (`xs:sequence`)      |
| XSD validation        | `xmllint-wasm` (libxml2 compiled to WASM)                                                                                                                                     | Works in Node and the browser, no native build |
| Schematron (XSLT 2.0) | SaxonJS (`xslt3` compiler + `saxon-js` runtime). **Decided.**                                                                                                                 | XSLT 2 is required, and libxslt is XSLT 1 only |
| Codegen               | Our own strict generator (`scripts/codegen/xsd.ts`). NEMSIS uses only sequence / simpleContent / restriction / union, so `cxsd` isn't needed. Unknown constructs fail codegen | XSD → schema model + (next) TS data types      |

## 4. Repo layout (target)

```
spec/nemsis.lock.json      # repo URL, selected paths/extensions, tag → commit SHA per version
spec/manifests/*.sha256    # sha256 of every fetched file, per version (filenames + hashes only)
scripts/fetch-spec.ts      # sparse-checkout of the pinned tag into .spec/ (gitignored), verifies hashes
scripts/codegen.ts         # .spec/XSDs → src/generated/ (committed, reviewed in PRs)
src/generated/v3_5_1/      # types, element metadata, enums
src/xml/                   # parse / serialize
src/validate/              # xsd.ts, schematron.ts
src/index.ts
test/                      # unit tests
test/golden/               # tests driven by .spec/ fixtures
.github/workflows/
```

## 5. GitHub Actions CI (first deliverable)

Milestone 0 is a **green, useful CI with no library code**.

**`ci.yml`**: on `push` to `main` and on `pull_request`
1. `permissions: contents: read`. Third-party actions pinned by commit SHA. `concurrency` cancels superseded runs.
2. Matrix `node: [22, 24, 26]` on `ubuntu-latest`. One extra job on `macos-latest`/Node 24 once XML/WASM is in.
3. `pnpm install --frozen-lockfile`
4. Restore `.spec/` cache keyed on `hashFiles('spec/nemsis.lock.json')` → `pnpm spec:fetch` (no-op if
   cached; **fails if any checksum mismatches**)
5. `pnpm lint` → `pnpm typecheck` → `pnpm test --coverage` → `pnpm build`
6. **Codegen drift check:** `pnpm codegen && git diff --exit-code src/generated` (from Milestone 2)
7. `publint` + `attw --pack` on the built package
8. Upload coverage and JUnit reports as artifacts. **Coverage gate:** 95% statements/lines/functions, 85% branches over `src/` and `scripts/` (generated data and thin CLI wrappers excluded).

**`spec-watch.yml`**: weekly cron + `workflow_dispatch`
- `git ls-remote --tags` on `nemsis_public`. If there's a 3.5.x tag newer than the lock file (3.5.2 is
  coming), open an issue (`issues: write`, limited to this job).

**`oracle.yml`**: `workflow_dispatch` only (later)
- Sends official sample files to `validator.nemsis.org` and compares its verdicts with our validators.

Also: Dependabot for `npm` and `github-actions`, a branch protection rule requiring `ci`, and a PR template
with the clean-room checkbox.

## 6. TDD approach

Write tests first from **official fixtures**, so "done" is defined by NEMSIS, not by us:

1. **Red, from golden data.** Each milestone starts with a failing test suite generated from `.spec/`:
   - every file in `Compliance/Pre-Testing/xml/{full,national}` → _must_ parse, round-trip and pass XSD
     and Schematron
   - `*-FailXsd_*` → _must_ fail XSD. `*-FailSchematron_*` → _must_ pass XSD and fail Schematron
   - `SampleData/Schematron/*/xml/*` → our SVRL output _must_ match the expected `svrl/` (normalized)
   - `DataDictionary/Ancillary/*_ElementDetails.txt` → generated metadata (minOccurs, maxOccurs, NV, PN,
     nillable, patterns) _must_ agree for every element. This cross-checks codegen against a second
     official source.
2. **Green with the smallest change**, then refactor. Unit tests (one element group at a time, e.g.
   `eTimes`) for the details the golden files don't pin down.
3. **Property tests** (`fast-check`, later): `serialize(parse(x))` is canonically equal to `x`, and
   `parse(serialize(obj))` deep-equals `obj` for generated valid objects.
4. Fixture tests are **skipped with a clear message** (not silently passed) if `.spec/` hasn't been fetched.

## 7. Milestones

| #     | Deliverable                                                                                                                                                                                                                                             | First failing test                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Scaffolding: package.json, tsconfig, Biome, Vitest, `ci.yml`, Dependabot, PR template, Apache-2.0 LICENSE                                                                                                                                               | `test/smoke.test.ts` (imports package entry). CI green on all Node versions                                                                 |
| 1     | `spec/nemsis.lock.json` + `spec:fetch` with checksum verification + CI cache + `spec-watch.yml`                                                                                                                                                         | Fetch test: lock file's tag SHA matches, every hash verifies, a tampered file fails                                                         |
| 2     | **2a (done):** XSD → schema model (tree, simple types, facets, enums, nemsisTacDoc) per version; drift check in CI. **2b (done):** TS document types: `v3_5_x.{EMS,DEM,State}` interfaces + `codes` unions, lossless `Leaf`/`NillableLeaf` value shapes | Model ≡ `Ancillary/*_ElementDetails.txt` for every element (1,302 elements, both versions)                                                  |
| 3     | **Done:** XSD validation (`nemsis-ts/validate`, `xmllint-wasm`). Schema files are passed in (`loadSchemaFiles` in `nemsis-ts/node`)                                                                                                                     | All compliance `full`/`national` + `FailSchematron` pass, `FailXsd` fail with element/line errors, 110 samples per version                  |
| 4     | **Done:** `parse(xml)` per version → dataset-discriminated typed document (NV, PN, `xsi:nil`, `CorrelationID`, attributes), issues with path/line. Comments and PIs are not preserved. DOCTYPE is rejected                                              | All 127 compliance + sample files per version are a lossless view of the XML (vs fast-xml-parser)                                           |
| 5     | **Done:** `serialize(doc)` per version → XML in `xs:sequence` order, exact values (escaped), strict about shape (`NemsisSerializeError` with path; no silent data loss)                                                                                 | Round-trip of 125 files per version: same content and order, reparses equal, same XSD outcome as the original                               |
| 6     | **Done:** Schematron via SaxonJS (optional peers `saxon-js`/`xslt3`). `compileSchematron` (`nemsis-ts/node`) runs the official ISO XSLT2 skeleton → SEF; `createSchematronValidator` (`nemsis-ts/schematron`) returns typed SVRL issues                 | All 250 `SampleData/Schematron` cases per version match the expected SVRL exactly. `FailSchematron` fails, `full`/`national` have no errors |
| 7     | **Done:** the six defined lists generated per version (`nemsis-ts/<version>/lists`: `definedLists.list/listsForElement/lookup/find`). XSD enum docs were already in the schema model                                                                    | XML ≡ NEMSIS JSON ≡ CSV for every list; each list's elements and types exist in the schema and every code satisfies its type's facets       |
| 8     | First release `0.1.0` (npm, provenance via GHA OIDC)                                                                                                                                                                                                    | `attw`/`publint` clean. Docs examples compile under test                                                                                    |
| later | 3.5.2 when released, WSDL client, X12 837P/835, FHIR mPSC                                                                                                                                                                                               | n/a                                                                                                                                         |

## 8. Decisions (2026-11-09)

- **License:** Apache-2.0.
- **NEMSIS redistribution:** don't vendor. We fetch the files at a pinned tag and verify checksums.
- **Schematron engine:** SaxonJS.
- **Versions at 0.1:** 3.5.0 (`3.5.0.251001CP6`) and 3.5.1 (`3.5.1.251001CP2`). Every golden-test suite runs
  against each version's own fixtures.
- **NEMSIS text in generated code (2026-11-09):** keep element definitions and code descriptions in the
  generated schema and JSDoc. Raw NEMSIS files still aren't committed.
- **Bundles (2026-11-09):** one subpath export per version (`nemsis-ts/3.5.0`, `nemsis-ts/3.5.1`). The root
  entry has helpers and types only, and CI's `check:bundle` enforces a 20 KiB budget and no cross-version data.

- **Bundled XSDs (2026-11-09):** optional at build time. `NEMSIS_BUNDLE_XSD=1 pnpm build` (or
  `pnpm build:with-xsd`) embeds each version's manifest-verified XSDs in `nemsis-ts/<version>/xsd`. The
  default build ships stubs (`bundled: false`, no files). Both variants have identical types, the repo
  never contains NEMSIS files, and CI checks both builds.

- **Browser support (2026-11-09):** verified by `pnpm test:browser` (Vitest browser mode, headless Chromium
  via Playwright). It loads the schema model and runs XSD validation on xmllint-wasm's browser build with the
  real 3.5.1 XSDs, getting the same result as Node on the compliance cases. It runs in CI as its own job.

## 9. Upstream findings

- **Stale EMS sample data (found 2026-11-09):** all 40 `SampleData/EMS/xml` files in both `3.5.0.251001CP6`
  and `3.5.1.251001CP2` fail XSD validation with exactly one error: `ePatient` is missing `ePatient.25`
  (Sex), which the October 2025 patch releases made mandatory. The samples still use `ePatient.13` and point
  at `release-3.5.0` XSDs. The compliance cases are up to date. Our golden test pins this exact error, so it
  will flag when NEMSIS regenerates the samples. Worth reporting to NEMSIS TAC.

- **SaxonJS 2.7 gaps vs Saxon on Java (found 2026-11-09):** (1) a string longer than 9 characters with
  surrounding whitespace is not castable to `xs:integer` (no whitespace collapse on the big-integer path),
  so `nemSch_e133` misfires on values like `191` followed by a newline and indentation; (2) `[ZN]` timezone
  names in `format-dateTime()` are not implemented ("Timezone names not implemented"), which crashes the
  "in the future" messages (`nemSch_e056` etc.). Both are worked around in the generated XSLT
  (`src/schematron/patches.ts`, with reasons) and verified against NEMSIS's expected SVRL. Worth reporting
  to Saxonica.
- **Licensing note:** SaxonJS is free to use under Saxonica's own (non-OSI) license. We do not bundle it:
  `saxon-js` and `xslt3` are optional peer dependencies, needed only for Schematron.

- **Defined-list renderings disagree (found 2026-11-10):** NEMSIS publishes each list as XML, JSON, CSV
  and XLSX. We generate from the XML and check the JSON and CSV against it. Differences found: (1) in
  `3.5.0.251001CP6` the XML of `CauseOfInjury` and `Medication` has list date 2024-07-08 while their JSON
  still says 2023-02-14; (2) the 3.5.0 CSVs are unquoted with M/D/YYYY dates while 3.5.1 CSVs are quoted
  with ISO dates; (3) the `Medication` CSV puts the vocabulary name (`RxNorm`) in its `CodeType` column
  where the XML/JSON carry the code (`9924003`), in both versions. The tests pin these. XLSX is not
  checked. Worth reporting to NEMSIS TAC.
- **Defined lists are suggestions, not enumerations:** codes such as ICD-10 symptoms are open vocabularies,
  so a code outside the list is not an error. `nemsis-ts` offers lookups only and does not validate against
  them.

## 10. Open questions

None right now.
