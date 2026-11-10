/**
 * Fetch the pinned NEMSIS artifacts into `.spec/<version>/` and verify them.
 *
 *   node scripts/fetch-spec.ts                    # fetch missing versions, verify all
 *   node scripts/fetch-spec.ts --write-manifests  # (maintainers) regenerate spec/manifests/*
 *
 * Exits non-zero if a commit or any file hash does not match the lock.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	diffManifest,
	formatManifest,
	hashTree,
	isClean,
	readLock,
	SPEC_DIR,
} from "./lib/spec.ts";

const writeManifests = process.argv.includes("--write-manifests");
const lock = readLock();

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
	}).trim();
}

function fetchVersion(version: string, commit: string, dest: string): void {
	const tmp = `${dest}.tmp`;
	rmSync(tmp, { recursive: true, force: true });
	mkdirSync(tmp, { recursive: true });
	git(tmp, "init", "-q");
	git(tmp, "remote", "add", "origin", lock.repository);
	git(
		tmp,
		"sparse-checkout",
		"set",
		"--no-cone",
		...lock.include.map((d) => `/${d}/`),
	);
	git(
		tmp,
		"fetch",
		"-q",
		"--depth",
		"1",
		"--filter=blob:none",
		"origin",
		`refs/tags/${version}`,
	);
	git(tmp, "-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD");
	const head = git(tmp, "rev-parse", "HEAD");
	if (head !== commit)
		throw new Error(
			`${version}: tag resolves to ${head}, lock expects ${commit}`,
		);
	rmSync(dest, { recursive: true, force: true });
	mkdirSync(dest, { recursive: true });
	for (const dir of lock.include) {
		const src = join(tmp, ...dir.split("/"));
		if (existsSync(src))
			cpSync(src, join(dest, ...dir.split("/")), { recursive: true });
	}
	writeFileSync(join(dest, ".commit"), `${commit}\n`);
	rmSync(tmp, { recursive: true, force: true });
}

let failed = false;
for (const [version, { commit }] of Object.entries(lock.versions)) {
	const dest = join(SPEC_DIR, version);
	if (!existsSync(join(dest, ".commit"))) {
		console.log(`fetching ${version} @ ${commit.slice(0, 12)}`);
		fetchVersion(version, commit, dest);
	}
	const actual = hashTree(dest, lock);
	if (writeManifests) {
		writeFileSync(lock.manifestPath(version), formatManifest(actual));
		console.log(`${version}: wrote manifest (${actual.size} files)`);
		continue;
	}
	const diff = diffManifest(lock.manifest(version), actual);
	if (isClean(diff)) {
		console.log(`${version}: ok (${actual.size} files verified)`);
	} else {
		failed = true;
		console.error(
			`${version}: VERIFICATION FAILED`,
			JSON.stringify(diff, null, 2),
		);
	}
}
process.exit(failed ? 1 : 0);
