/**
 * Fetch / verify / watch against throwaway local git repositories standing in for nemsis_public.
 */
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	fetchVersion,
	listReleaseTags,
	syncVersions,
} from "../../scripts/lib/fetch.ts";
import {
	formatManifest,
	hashTree,
	type Selection,
} from "../../scripts/lib/spec.ts";

const selection: Selection = { include: ["XSDs"], extensions: ["xsd"] };

function git(cwd: string, ...args: string[]): string {
	return execFileSync(
		"git",
		["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args],
		{
			cwd,
			encoding: "utf8",
		},
	).trim();
}

/** A repo with XSDs/a.xsd + Docs/readme.xsd, tagged `3.5.9.990101` (annotated) and `3.5.9.990201CP1`. */
function upstream() {
	const repo = mkdtempSync(join(tmpdir(), "nemsis-upstream-"));
	git(repo, "init", "-q", "-b", "main");
	mkdirSync(join(repo, "XSDs"));
	mkdirSync(join(repo, "Docs"));
	writeFileSync(join(repo, "XSDs", "a.xsd"), "<a/>");
	writeFileSync(join(repo, "XSDs", "notes.pdf"), "pdf");
	writeFileSync(join(repo, "Docs", "readme.xsd"), "<r/>");
	git(repo, "add", "-A");
	git(repo, "commit", "-q", "-m", "one");
	git(repo, "tag", "-a", "3.5.9.990101", "-m", "release");
	const first = git(repo, "rev-parse", "HEAD");
	writeFileSync(join(repo, "XSDs", "a.xsd"), "<a2/>");
	git(repo, "commit", "-q", "-am", "two");
	git(repo, "tag", "3.5.9.990201CP1");
	return { repo, first, second: git(repo, "rev-parse", "HEAD") };
}

describe("fetchVersion", () => {
	it("checks out only the selected paths at the tag and records the commit", () => {
		const { repo, first } = upstream();
		const dest = join(
			mkdtempSync(join(tmpdir(), "nemsis-dest-")),
			"3.5.9.990101",
		);
		fetchVersion(
			{ repository: repo, ...selection },
			"3.5.9.990101",
			first,
			dest,
		);
		expect(readFileSync(join(dest, "XSDs", "a.xsd"), "utf8")).toBe("<a/>");
		expect(existsSync(join(dest, "Docs"))).toBe(false);
		expect(readFileSync(join(dest, ".commit"), "utf8")).toBe(`${first}\n`);
		expect(existsSync(`${dest}.tmp`)).toBe(false);
	});

	it("refuses a tag that resolves to a different commit than the lock", () => {
		const { repo, second } = upstream();
		const dest = join(mkdtempSync(join(tmpdir(), "nemsis-dest-")), "v");
		expect(() =>
			fetchVersion(
				{ repository: repo, ...selection },
				"3.5.9.990101",
				second,
				dest,
			),
		).toThrow(/3\.5\.9\.990101: tag resolves to [0-9a-f]{40}, lock expects/);
		expect(existsSync(join(dest, ".commit"))).toBe(false);
	});

	it("fails when the tag does not exist", () => {
		const { repo, first } = upstream();
		const dest = join(mkdtempSync(join(tmpdir(), "nemsis-dest-")), "v");
		expect(() =>
			fetchVersion(
				{ repository: repo, ...selection },
				"3.5.9.000000",
				first,
				dest,
			),
		).toThrow();
	});
});

describe("syncVersions", () => {
	function setup() {
		const { repo, first } = upstream();
		const work = mkdtempSync(join(tmpdir(), "nemsis-sync-"));
		const lockDir = join(work, "spec");
		mkdirSync(join(lockDir, "manifests"), { recursive: true });
		const lock = {
			repository: repo,
			...selection,
			versions: { "3.5.9.990101": { commit: first } },
		};
		writeFileSync(join(lockDir, "nemsis.lock.json"), JSON.stringify(lock));
		return {
			lockPath: join(lockDir, "nemsis.lock.json"),
			specDir: join(work, ".spec"),
			lockDir,
		};
	}

	it("writes manifests, then verifies a clean tree", () => {
		const { lockPath, specDir, lockDir } = setup();
		const log: string[] = [];
		expect(
			syncVersions({
				lockPath,
				specDir,
				writeManifests: true,
				log: (m) => log.push(m),
			}),
		).toBe(true);
		expect(
			readFileSync(join(lockDir, "manifests", "3.5.9.990101.sha256"), "utf8"),
		).toBe(formatManifest(hashTree(join(specDir, "3.5.9.990101"), selection)));
		expect(syncVersions({ lockPath, specDir, log: (m) => log.push(m) })).toBe(
			true,
		);
		expect(log).toEqual([
			expect.stringMatching(/^fetching 3\.5\.9\.990101 @ [0-9a-f]{12}$/),
			"3.5.9.990101: wrote manifest (1 files)",
			"3.5.9.990101: ok (1 files verified)",
		]);
	});

	it("reports tampering without re-fetching", () => {
		const { lockPath, specDir } = setup();
		syncVersions({ lockPath, specDir, writeManifests: true, log: () => {} });
		writeFileSync(
			join(specDir, "3.5.9.990101", "XSDs", "a.xsd"),
			"<tampered/>",
		);
		writeFileSync(join(specDir, "3.5.9.990101", "XSDs", "extra.xsd"), "<x/>");
		const errors: string[] = [];
		expect(
			syncVersions({
				lockPath,
				specDir,
				log: () => {},
				error: (m) => errors.push(m),
			}),
		).toBe(false);
		expect(errors.join("\n")).toMatch(/3\.5\.9\.990101: VERIFICATION FAILED/);
		expect(errors.join("\n")).toMatch(/"changed": \[\s*"XSDs\/a\.xsd"/);
		expect(errors.join("\n")).toMatch(/"extra": \[\s*"XSDs\/extra\.xsd"/);
	});
});

describe("listReleaseTags", () => {
	it("lists tag names (annotated and lightweight) from the remote", () => {
		const { repo } = upstream();
		expect(listReleaseTags(repo).sort()).toEqual([
			"3.5.9.990101",
			"3.5.9.990201CP1",
		]);
	});
});
