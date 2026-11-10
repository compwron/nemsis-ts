/**
 * Pinning and integrity checks for the official NEMSIS artifacts we build against.
 * NEMSIS files are never committed; they are fetched into `.spec/<version>/` and verified
 * against the per-version manifests in `spec/manifests/`.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT: string = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
);
export const LOCK_PATH: string = join(REPO_ROOT, "spec", "nemsis.lock.json");
export const SPEC_DIR: string = join(REPO_ROOT, ".spec");

/** Which files of the NEMSIS repo we use. */
export interface Selection {
	/** Directories (posix, relative to the repo root) to include recursively. */
	include: string[];
	/** File extensions (without dot) to keep. */
	extensions: string[];
}

export type Manifest = Map<string, string>;

export interface Lock extends Selection {
	repository: string;
	versions: Record<string, { commit: string }>;
	manifestPath(version: string): string;
	manifest(version: string): Manifest;
}

export function readLock(path: string = LOCK_PATH): Lock {
	const raw = JSON.parse(readFileSync(path, "utf8")) as Omit<
		Lock,
		"manifest" | "manifestPath"
	>;
	const manifestPath = (version: string): string =>
		join(dirname(path), "manifests", `${version}.sha256`);
	return {
		...raw,
		manifestPath,
		manifest: (version) =>
			parseManifest(readFileSync(manifestPath(version), "utf8")),
	};
}

function sha256(file: string): string {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function walk(dir: string, out: string[]): void {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else out.push(p);
	}
}

/** Hash every selected file under `root`. Keys are posix paths, sorted. */
export function hashTree(root: string, selection: Selection): Manifest {
	const exts = new Set(selection.extensions.map((e) => e.toLowerCase()));
	const files: string[] = [];
	for (const dir of selection.include) {
		const abs = join(root, ...dir.split("/"));
		if (existsSync(abs)) walk(abs, files);
	}
	const entries = files
		.filter((f) => exts.has(f.slice(f.lastIndexOf(".") + 1).toLowerCase()))
		.map((f) => [relative(root, f).split(sep).join("/"), sha256(f)] as const)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return new Map(entries);
}

/** `sha256sum`-compatible text: `<hex>  <path>\n` per file. */
export function formatManifest(m: Manifest): string {
	return [...m].map(([path, hash]) => `${hash}  ${path}\n`).join("");
}

export function parseManifest(text: string): Manifest {
	const m: Manifest = new Map();
	text.split("\n").forEach((line, i) => {
		if (line === "") return;
		const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
		if (!match?.[1] || !match[2])
			throw new Error(`Malformed manifest line ${i + 1}: ${line}`);
		m.set(match[2], match[1]);
	});
	return m;
}

export interface ManifestDiff {
	missing: string[];
	extra: string[];
	changed: string[];
}

export function diffManifest(
	expected: Manifest,
	actual: Manifest,
): ManifestDiff {
	const missing: string[] = [];
	const changed: string[] = [];
	for (const [path, hash] of expected) {
		const got = actual.get(path);
		if (got === undefined) missing.push(path);
		else if (got !== hash) changed.push(path);
	}
	const extra = [...actual.keys()].filter((p) => !expected.has(p));
	return { missing, extra, changed };
}

export function isClean(d: ManifestDiff): boolean {
	return d.missing.length + d.extra.length + d.changed.length === 0;
}

/** NEMSIS release tags look like `3.5.1.251001CP2`: major.minor.patch.YYMMDD[CPn]. */
const RELEASE_TAG = /^3\.5\.\d+\.(\d{6})(?:CP(\d+))?$/;

function releaseKey(tag: string): string | undefined {
	const m = RELEASE_TAG.exec(tag);
	return m?.[1] ? `${m[1]}.${(m[2] ?? "0").padStart(3, "0")}` : undefined;
}

/** 3.5.x tags not in `locked` and released after the newest locked release, oldest first. */
export function newerReleaseTags(
	tags: readonly string[],
	locked: readonly string[],
): string[] {
	const newest =
		locked
			.map(releaseKey)
			.filter((k) => k !== undefined)
			.sort()
			.at(-1) ?? "";
	return tags
		.filter((t) => !locked.includes(t))
		.map((t) => [t, releaseKey(t)] as const)
		.filter(
			(e): e is readonly [string, string] =>
				e[1] !== undefined && e[1] > newest,
		)
		.sort((a, b) => (a[1] < b[1] ? -1 : 1))
		.map(([t]) => t);
}
