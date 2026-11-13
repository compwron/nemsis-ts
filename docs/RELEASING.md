# Releasing

Nothing is published yet, and the repository is private on purpose: the maintainers are waiting on external
discussions before going public. Everything below is prepared so that publishing is a short, boring checklist
once that decision is made. Until then three locks keep a release from happening by accident:

1. `package.json` has `"private": true` (npm refuses to publish it) and `version` is `0.0.0`.
2. `.github/workflows/release.yml` only runs when started by hand, and its job is skipped unless the repository
   variable `RELEASE_ENABLED` is `true`.
3. The job refuses to run while `private` is still `true` or the version is still `0.0.0`.

## Plan for 0.0.1 and going public (owner intent, 2026-11-12)

The owner wants to get what can be done finished, publish **0.0.1**, and make the repository public. This is a
plan only: nothing below has been done, and publishing and the visibility change are explicit owner actions.

What 0.0.1 would contain: the NEMSIS core as it stands (parse, serialize, XSD and Schematron validation,
defined lists, `ws`). FHIR is not part of it unless a first slice lands and is marked experimental.

Found while auditing the repo for going public (2026-11-12), for the owner to decide:

- **Commit email: resolved 2026-11-12.** History was rewritten so all commits use GitHub's `noreply` address and `main` was force-pushed. Old SHAs may linger on GitHub (PR refs, caches) until it garbage-collects them; owner accepted that.
- No secrets or tokens found in tracked files (grep for password/token/secret matched only code and docs
  about them). `.spec/`, `coverage/`, `dist/` are gitignored.
- `README.md` names peak-server and emberstone (GPL/AGPL) as projects we did not copy from. Fine, but decide
  whether to keep naming them in a public README.
- `docs/HANDOFF.md` and `docs/NOTES.md`: **owner decided to keep both in the public tree** (2026-11-12).
- Still open from the list below: NEMSIS TAC naming/attribution, Saxonica license re-read, name re-check
  (`npm view nemsis-ts` right before publishing), account/2FA and trusted publishing setup.

Suggested order once the owner says go: resolve the email-history question; re-check the npm name; write the
0.0.1 CHANGELOG entry; set `version` to `0.0.1` and remove `"private": true` on a branch; dry run of the
release workflow; make the repo public; publish; verify.

## Owner answers and research, 2026-11-12

- **README naming of peak-server and emberstone:** keep.
- **NEMSIS TAC:** the owner does not want to contact other organizations; reading public websites is fine.
  Read: nemsis.org front page and its "XSD guides & usage" page, plus the fetched artifacts under `.spec/`
  (XSD, Schematron, WSDL, defined lists). None of them states a license, copyright notice, trademark or
  logo policy, or attribution rule (page text only; I did not find a license file in the fetched tree).
  Absence of a statement is not permission: keep the README's "independent, not affiliated or endorsed" wording
  and avoid logos. The risk is the owner's call.
- **Saxonica:** re-read the license shipped in `saxon-js` and `xslt3` 2.7.0 (`LICENSE.txt`, "Version 1.0, June
  2020"; npm field says "SEE LICENSE IN LICENSE.txt"; the two files are byte-identical). Terms that matter:
  use is allowed on the computer running it; **redistribution in binary form, unmodified, is allowed as part of an
  application that uses it, with the copyright notice and disclaimer reproduced**; no reverse engineering; no
  endorsement use of Saxonica's name; copying it to a site whose primary purpose is making it available to third
  parties needs written permission. We do not bundle or ship it (optional peer dependencies installed by the
  user), which stays clearly inside these terms. If we ever bundled it we would have to reproduce the notice and
  disclaimer. Not legal advice. The Saxonica web docs for the license did not load for me.
- **npm name:** re-check (`npm view nemsis-ts`) immediately before publishing, as planned.
- **npm account and token:** the owner has an npm account and a new publishing token that is not stored anywhere
  reachable yet. Keep it that way until needed. Do not paste it into chat, files, commits or logs.
- **Trusted publishing (read docs.npmjs.com/trusted-publishers on 2026-11-12):** this is what we want; no token is
  needed to publish. Facts from the page:
  - Needs npm CLI 11.5.1+ and Node 22.14+, a GitHub-hosted runner (self-hosted not supported) and
    `id-token: write` (our `release.yml` has all of that).
  - On npmjs.com: package settings, Trusted Publisher, GitHub Actions; fields: owner `compwron`, repository
    `nemsis-ts`, workflow file `release.yml`, environment `npm`. Existing entries cannot be edited, only
    deleted and recreated. npm does **not** validate the entry when saving; mistakes show up only when
    publishing. `package.json` `repository.url` must exactly match the GitHub repo (it is
    `git+https://github.com/compwron/nemsis-ts.git`; fine).
  - A new entry "must complete its first successful publish within 2 days" or it expires.
  - Provenance is generated only when the repo is public and the package is public; not for private repos.
  - After it works, set "Require two-factor authentication and disallow tokens" under the package's Publishing
    access, which also makes the stored token useless; then delete that token.
  - Option: `npm stage publish` is always allowed for a trusted publisher (CI stages, a human approves
    interactively), which is stricter than letting CI publish directly. Decide later.
  - **Unclear: whether a trusted publisher can be added before the package exists.** The page implies configuring
    comes before the first publish (the 2-day rule), while third-party write-ups say the package must exist and
    npm has no pending publisher. Try it in the npm UI first. If it is not possible, publish 0.0.1 once by hand from
    the owner's machine with the token (`npm publish --access public`, no provenance), then configure trusted
    publishing for every later release. Either way no token needs to be stored in GitHub.

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
   - [ ] **README badges** (add only after the first publish and once the repo is public, otherwise they render broken): npm version, CI status (`ci.yml`), license, and optionally npm downloads / bundle size. Use shields.io or GitHub's native workflow badge.
6. **Afterwards:** set `RELEASE_ENABLED` back to something other than `true` if you want publishing off
   between releases.

## If something goes wrong

- npm versions are permanent. A bad release is fixed by publishing a new patch version and, if needed,
  `npm deprecate <name>@<version> "reason"`. Do not rely on `npm unpublish`.
- If the pinned NEMSIS tags move again, CI fails at `spec:fetch` by design; follow the steps recorded in
  `docs/PLAN.md` §9 (compare hashes, re-pin, regenerate, update tests) before releasing.
