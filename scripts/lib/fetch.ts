/** Fetch pinned NEMSIS release tags with git and verify them against the committed manifests. */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	diffManifest,
	formatManifest,
	hashTree,
	isClean,
	LOCK_PATH,
	readLock,
	type Selection,
	SPEC_DIR,
} from "./spec.ts";

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

export interface Source extends Selection {
	repository: string;
}

/**
 * Sparse-fetch `refs/tags/<version>` into `dest`, keeping only the selected directories.
 * Throws (leaving `dest` untouched) if the tag does not resolve to `commit`.
 */
export function fetchVersion(
	source: Source,
	version: string,
	commit: string,
	dest: string,
): void {
	const tmp = `${dest}.tmp`;
	rmSync(tmp, { recursive: true, force: true });
	mkdirSync(tmp, { recursive: true });
	try {
		git(tmp, "init", "-q");
		git(tmp, "remote", "add", "origin", source.repository);
		git(
			tmp,
			"sparse-checkout",
			"set",
			"--no-cone",
			...source.include.map((d) => `/${d}/`),
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
		for (const dir of source.include) {
			const src = join(tmp, ...dir.split("/"));
			if (existsSync(src))
				cpSync(src, join(dest, ...dir.split("/")), { recursive: true });
		}
		writeFileSync(join(dest, ".commit"), `${commit}\n`);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

export interface SyncOptions {
	lockPath?: string;
	specDir?: string;
	/** Regenerate the manifests from the fetched trees instead of verifying against them. */
	writeManifests?: boolean;
	log?: (message: string) => void;
	error?: (message: string) => void;
}

/** Fetch every locked version that is missing, then verify (or write) its manifest. Returns success. */
export function syncVersions(options: SyncOptions = {}): boolean {
	const {
		lockPath = LOCK_PATH,
		specDir = SPEC_DIR,
		writeManifests = false,
	} = options;
	const log = options.log ?? console.log;
	const error = options.error ?? console.error;
	const lock = readLock(lockPath);
	let ok = true;
	for (const [version, { commit }] of Object.entries(lock.versions)) {
		const dest = join(specDir, version);
		if (!existsSync(join(dest, ".commit"))) {
			log(`fetching ${version} @ ${commit.slice(0, 12)}`);
			fetchVersion(lock, version, commit, dest);
		}
		const actual = hashTree(dest, lock);
		if (writeManifests) {
			writeFileSync(lock.manifestPath(version), formatManifest(actual));
			log(`${version}: wrote manifest (${actual.size} files)`);
			continue;
		}
		const diff = diffManifest(lock.manifest(version), actual);
		if (isClean(diff)) {
			log(`${version}: ok (${actual.size} files verified)`);
		} else {
			ok = false;
			error(`${version}: VERIFICATION FAILED ${JSON.stringify(diff, null, 2)}`);
		}
	}
	return ok;
}

/** All tag names on the remote. */
export function listReleaseTags(repository: string): string[] {
	return git(process.cwd(), "ls-remote", "--tags", "--refs", repository)
		.split("\n")
		.map((l) => l.split("refs/tags/")[1])
		.filter((t): t is string => Boolean(t));
}
