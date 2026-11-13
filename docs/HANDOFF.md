# Handoff: read this first

Written 2026-11-12 (state: after the `ws` client commit; all SHAs changed in a history rewrite the same day, see `docs/NOTES.md`) for whoever continues this work, usually a
fresh Claude session with no memory of the earlier ones. Facts here were true on that date; verify anything
that names a file, version or PR before relying on it. The long story lives in `docs/PLAN.md` (decisions §8,
upstream findings §9) and `docs/NOTES.md` (dated log of what was looked at and why, newest first).

## What this is

`nemsis-ts`: a clean-room, Apache-2.0 TypeScript library for reading, writing and validating **NEMSIS v3.5**
EMS data (the US national patient-care-report standard). The ultimate aim is an EMS-billing codebase: X12
837P/835 claims and a FHIR (IHE mPSC) mapping, built on top of the NEMSIS core. The repo is **private on
GitHub** (`compwron/nemsis-ts`) and **not published to npm**; both are planned, but the owner is waiting on
external discussions first. Do not publish, do not make the repo public, do not remove `"private": true`.

## Where things stand

Done and pushed (milestones in `docs/PLAN.md` §7): schema model and generated types for NEMSIS **3.5.0** and
**3.5.1**; `parse` and `serialize` (round-trip tested on 125 official files per version); XSD validation
(`nemsis-ts/validate`, libxml2 WASM); Schematron validation via SaxonJS (`nemsis-ts/schematron`, compile in
`nemsis-ts/node`); defined lists (`nemsis-ts/3.5.x/lists`); the SOAP web-service client (`nemsis-ts/ws`);
README examples type-checked by a test; `CHANGELOG.md`, `docs/RELEASING.md`, and an inert release workflow.
About 2,850 Node tests plus 12 browser tests; coverage about 99% statements, 92% branches (gates: 95/95/95/85).

## Working agreements with the owner (compwron)

- **Commit and push to `main` after every step** (saved in memory). Pushing straight to `main` is accepted.
  Commit messages end with `Co-Authored-By: <current model> <noreply@anthropic.com>`; PR bodies end with
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Run `corepack pnpm format` before every commit.** CI lint failed once because I edited after formatting.
- **Clean room:** never read or copy GPL/AGPL implementations (peak-server, emberstone). Everything comes from
  NEMSIS TAC's public artifacts, the official specs and our own tests.
- **Privacy:** keep the owner's email out of anything external. Do not send the project's name or details to
  outside services unasked (the owner explicitly asked for the one npm name lookup; `nemsis-ts` was unclaimed on
  2026-11-11). Credentials never go in errors, logs or tests.
- **Do not fabricate results.** Say plainly what was and was not verified (see PLAN §9 for the pattern).
- Decisions already made (do not re-litigate): fetch NEMSIS files, never vendor them; SaxonJS for Schematron
  (optional peers, never bundled: Saxonica's license); Apache-2.0; both 3.5.0 and 3.5.1; keep NEMSIS
  documentation text in generated code; per-version bundles; optional build-time XSD bundling
  (`NEMSIS_BUNDLE_XSD=1`).

## How to work in the repo

- Node **26.13.0** (`.tool-versions`, asdf). `engines >=22`; CI tests 22/24/26. Node 26 ships no corepack:
  `npm install -g corepack && asdf reshim nodejs`, then use `corepack pnpm <script>` (pnpm 10.34.9).
- NEMSIS artifacts: `corepack pnpm spec:fetch` into `.spec/<version>/` (gitignored, hash-verified against
  `spec/manifests/*.sha256` and the commits in `spec/nemsis.lock.json`). Schematron needs
  `corepack pnpm schematron:compile` (about 70 s, cached under `.spec/<version>/compiled/`).
- Before pushing, the CI sequence: `lint`, `codegen:check`, `typecheck`, `test:coverage`, `test:browser`,
  `build`, `check:bundle`, `check:package` (publint needs `pnpm` on PATH: a wrapper script
  `exec corepack pnpm "$@"` in a directory on PATH works). The full test run takes about 3 minutes.
  `codegen:check` fails while regenerated files are uncommitted; that is expected.
- `gh` is authenticated but its token **lacks the `workflow` scope**, so it cannot merge PRs that touch
  `.github/workflows/`. Apply such changes with a normal commit and `git push` (SSH works).
- Temporary files: use `$CLAUDE_JOB_DIR/tmp` or `/tmp/claude-*`, not bare `/tmp`.
- Layout: `src/` (`schema/`, `generated/` committed, `xml/` parse+serialize, `validate/`, `schematron/`,
  `lists/`, `ws/`, `xsd/` stubs; entry files `index.ts`, `3.5.0.ts`, `3.5.1.ts`, `validate.ts`,
  `schematron.ts`, `ws.ts`, `node.ts`), `scripts/` (codegen, spec fetch/watch, bundle check, Schematron
  compile), `spec/` (lock and manifests), `test/` (`golden/` against official artifacts, unit tests per area,
  `browser/` Vitest browser mode), `.github/workflows/` (`ci.yml`, `spec-watch.yml`, `release.yml`).

## Pitfalls already hit

- **NEMSIS moved its release tags** (2026-11-10/11): our commit pin caught it (CI failed at `spec:fetch`). The
  fix is a human review: diff file hashes, re-pin, regenerate, update tests. See PLAN §9. Do not auto-update.
- Biome reformats files, which breaks exact-text edits written earlier in the same session. Re-read the file
  (or use a whitespace-tolerant regex) before editing something you wrote before formatting.
- `isolatedDeclarations` requires explicit type annotations on every exported const, including in tests.
- Dependabot cooldowns do not cover transitive packages; pnpm `minimumReleaseAge` is 7 days. A lockfile that
  pulls in a package younger than that conflicts with policy.
- The CI browser job once failed because the runner could not resolve Ubuntu's mirrors; the install now skips
  `--with-deps` (see NOTES 2026-11-11). If a library is ever missing, bring `--with-deps` back.
- `pnpm test` golden tests skip with a warning when `.spec/` is missing locally, but fail in CI.

## Waiting on the owner (ask, do not guess)

1. **File the two SaxonJS bug reports** (drafts in `docs/NOTES.md`, "Draft 1/2"; filing needs a Saxonica
   tracker account). Afterwards link them in `src/schematron/patches.ts` and PLAN §9.
2. **X12 guides:** the owner can obtain the paid TR3 implementation guides `005010X222A1` (837P) and
   `005010X221A1` (835) but does not have them yet. X12 work is blocked on them; do not guess the spec.
3. **Going public / npm release:** decisions and the checklist are in `docs/RELEASING.md`.
4. **Questions worth sending to NEMSIS TAC** (PLAN §9): EMS samples lack mandatory `ePatient.25`; release tags
   were moved; defined-list XML/JSON/CSV renderings disagree; is re-tagging intended and how should
   consumers pin?
5. **A live-server test account** (state repository or the NEMSIS validator) to check the web-service client
   against reality (it is only tested against the WSDL schema and fixtures; `schemaVersion` format assumed).

## Dated follow-ups

- **Dependabot PRs** were closed and their branches deleted in the 2026-11-12 history rewrite; Dependabot should reopen them. The `tsdown` 0.23.5 update pulled transitive `@yuku-toolchain/*@0.25.0` (published 2026-11-10), inside our 7-day window: merge it only on or after **2026-11-17**, if CI is green.
- `spec-watch.yml` opens an issue when NEMSIS tags a new 3.5.x release (3.5.2 is scoped, not released).
- Node 22 ends 2027-04-30: then raise `engines` to `>=24` and the CI matrix to 24/26 (+28 when it exists).

## Next steps, in order

1. **FHIR (IHE mPSC) mapping.** There is no NEMSIS-based FHIR guide; IHE mPSC (draft, FHIR R4) is the closest,
   with an incomplete NEMSIS mapping (https://build.fhir.org/ig/IHE/PCC.PCS/, page NEMSIS-Mapping). Start by
   reading the current IG, then write `docs/FHIR-MAPPING.md` (NEMSIS element to FHIR resource/field, with gaps)
   and agree it with the owner **before** writing code. Likely a new entry `nemsis-ts/fhir`. The IG is a moving
   draft: pin the version you read. Free to read, so this is unblocked.
2. **X12 837P/835** once the owner has the guides (same approach: mapping document first, then tests from the
   guides' examples; no GPL/AGPL code; only the EMS-relevant subset). Also 270/271 and 276/277 are planned.
3. **Release (Milestone 8)** after the owner decides to go public: follow `docs/RELEASING.md`.
4. Smaller: live-server checks for `nemsis-ts/ws` when an account exists; HL7 v2/CDA only if asked; NEMSIS 3.5.2
   when released (re-pin, regenerate, add to `SUPPORTED_VERSIONS`).

When you finish a step: update `CHANGELOG.md` (Unreleased), the milestone table in `docs/PLAN.md` and any
findings in §9, add a dated entry to `docs/NOTES.md`, commit, push, and check CI.
