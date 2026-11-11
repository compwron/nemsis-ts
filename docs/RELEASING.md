# Releasing

Nothing is published yet, and the repository is private on purpose: the maintainers are waiting on external
discussions before going public. Everything below is prepared so that publishing is a short, boring checklist
once that decision is made. Until then three locks keep a release from happening by accident:

1. `package.json` has `"private": true` (npm refuses to publish it) and `version` is `0.0.0`.
2. `.github/workflows/release.yml` only runs when started by hand, and its job is skipped unless the repository
   variable `RELEASE_ENABLED` is `true`.
3. The job refuses to run while `private` is still `true` or the version is still `0.0.0`.

## Decisions to make first (not code)

- [ ] **Go public?** npm provenance (a signed link from the package to this repo's workflow run) only works
  for public repositories, and it is the main reason to publish from CI. Public repositories also get free
  GitHub Actions minutes; private ones are metered.
- [ ] **Package name.** `nemsis-ts` was unclaimed on npm when checked on 2026-11-11 (the registry answered
  404). A name is only yours once published, and npm also refuses names too similar to existing ones, so
  re-check right before the first publish (`npm view nemsis-ts`) and confirm the maintainers still want it.
  Consider a scope (`@org/name`) if the name is taken or if NEMSIS TAC asks for
  distance from the official brand. A scoped package needs `--access public` (already in the workflow).
- [ ] **NEMSIS relationship.** The library is independent and clean-room. Confirm with NEMSIS TAC that the
  README/package description names NEMSIS acceptably, and that keeping NEMSIS documentation text in the
  generated code is fine (the decision so far is "keep"; see `docs/PLAN.md` §8). Consider adding a
  `NOTICE` file with the attribution if they ask for one.
- [ ] **Saxonica.** `saxon-js` and `xslt3` are optional peer dependencies under Saxonica's own license (not
  OSI). Re-read their current license before release and keep the README wording that they are not
  bundled and only needed for Schematron.
- [ ] **File the SaxonJS bug reports** (drafts in `docs/NOTES.md`) and add the issue links to
  `src/schematron/patches.ts`.

## One-time setup (after going public)

- [ ] npm account or organisation with 2FA; reserve the package name.
- [ ] **Trusted publishing:** on npmjs.com, package settings → Trusted publisher → GitHub Actions, with this
  repository, workflow file `release.yml` and environment `npm`. This lets the workflow publish with a
  short-lived OIDC token; no long-lived npm token is stored in GitHub. Needs npm CLI 11.5.1 or newer
  (Node 26 ships a newer one; verify with the dry run).
- [ ] GitHub → Settings → Environments → create `npm`; add yourself as a required reviewer so every publish
  needs an explicit approval.
- [ ] GitHub → Settings → Secrets and variables → Actions → Variables: add `RELEASE_ENABLED` = `true`
  (remove or set to anything else to switch publishing off again).
- [ ] Branch protection on `main`: require the CI checks; stop pushing directly to `main`.

## For each release

1. **Prepare on a branch/PR:**
   - [ ] `package.json`: remove `"private": true`; set `version` (e.g. `0.1.0`).
   - [ ] `CHANGELOG.md`: rename `[Unreleased]` to the version and date; start a fresh `[Unreleased]`.
   - [ ] `pnpm spec:fetch && pnpm schematron:compile && pnpm lint && pnpm codegen:check && pnpm typecheck && pnpm test && pnpm test:browser && pnpm build && pnpm check:bundle && pnpm check:package`
     all pass locally; CI is green (Node 22, 24, 26 and the browser job).
   - [ ] `pnpm pack --dry-run`: the tarball holds only `dist/`, `LICENSE`, `README.md`, `package.json`.
   - [ ] Optional bundle with XSDs: decide whether the release also ships `NEMSIS_BUNDLE_XSD=1` output
     (it is off by default; the NEMSIS files are fetched, not vendored, per the decision in the plan).
2. **Dry run:** merge, then Actions → release → _Run workflow_ with _dry-run_ ticked, and approve the `npm`
   environment. It runs the full checks and `npm publish --dry-run`.
3. **Publish:** run it again with _dry-run_ unticked and approve.
4. **Tag and announce:** create the Git tag `v<version>` and a GitHub release from the changelog entry.
5. **Verify:** `npm view <name> version`; the package page shows the provenance badge; install it in a scratch
   project and run the README example.
6. **Afterwards:** set `RELEASE_ENABLED` back to something other than `true` if you want publishing off
   between releases.

## If something goes wrong

- npm versions are permanent. A bad release is fixed by publishing a new patch version and, if needed,
  `npm deprecate <name>@<version> "reason"`. Do not rely on `npm unpublish`.
- If the pinned NEMSIS tags move again, CI fails at `spec:fetch` by design; follow the steps recorded in
  `docs/PLAN.md` §9 (compare hashes, re-pin, regenerate, update tests) before releasing.
