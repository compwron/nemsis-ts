import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
	diffManifest,
	formatManifest,
	hashTree,
	type Lock,
	newerReleaseTags,
	parseManifest,
	readLock,
} from "../../scripts/lib/spec.ts";
import { SUPPORTED_VERSIONS } from "../../src/index.ts";

const rules = { include: ["XSDs", "Rules"], extensions: ["xsd", "sch"] };

function fixtureTree(): string {
	const root = mkdtempSync(join(tmpdir(), "nemsis-spec-"));
	mkdirSync(join(root, "XSDs"));
	mkdirSync(join(root, "Rules", "nested"), { recursive: true });
	mkdirSync(join(root, "Docs"));
	writeFileSync(join(root, "XSDs", "a.xsd"), "<a/>");
	writeFileSync(join(root, "Rules", "nested", "b c.sch"), "<b/>");
	writeFileSync(join(root, "Rules", "ignored.pdf"), "pdf");
	writeFileSync(join(root, "Docs", "ignored.xsd"), "<x/>");
	return root;
}

describe("hashTree", () => {
	let root: string;
	beforeEach(() => {
		root = fixtureTree();
	});

	it("hashes only included directories and extensions, keyed by posix path", () => {
		const m = hashTree(root, rules);
		expect([...m.keys()]).toEqual(["Rules/nested/b c.sch", "XSDs/a.xsd"]);
		expect(m.get("XSDs/a.xsd")).toBe(
			"29114363f749a0226b6988dda3ca2492a954117ab6b5f382706c20300dabc079",
		);
	});

	it("is deterministic", () => {
		expect(formatManifest(hashTree(root, rules))).toBe(
			formatManifest(hashTree(root, rules)),
		);
	});
});

describe("manifest format", () => {
	it("round-trips, including paths with spaces", () => {
		const m = new Map([
			["Rules/nested/b c.sch", "a".repeat(64)],
			["XSDs/a.xsd", "b".repeat(64)],
		]);
		const text = formatManifest(m);
		expect(text).toBe(
			`${"a".repeat(64)}  Rules/nested/b c.sch\n${"b".repeat(64)}  XSDs/a.xsd\n`,
		);
		expect(parseManifest(text)).toEqual(m);
	});

	it("rejects malformed lines", () => {
		expect(() => parseManifest("nothex  file.xsd\n")).toThrow(/line 1/);
	});
});

describe("diffManifest", () => {
	const expected = new Map([
		["a.xsd", "1".repeat(64)],
		["b.xsd", "2".repeat(64)],
		["c.xsd", "3".repeat(64)],
	]);

	it("reports nothing when equal", () => {
		expect(diffManifest(expected, new Map(expected))).toEqual({
			missing: [],
			extra: [],
			changed: [],
		});
	});

	it("reports missing, extra and tampered files", () => {
		const actual = new Map([
			["a.xsd", "1".repeat(64)],
			["c.xsd", "f".repeat(64)],
			["d.xsd", "4".repeat(64)],
		]);
		expect(diffManifest(expected, actual)).toEqual({
			missing: ["b.xsd"],
			extra: ["d.xsd"],
			changed: ["c.xsd"],
		});
	});
});

describe("spec/nemsis.lock.json", () => {
	const lock: Lock = readLock();

	it("points at the NEMSIS TAC public repository", () => {
		expect(lock.repository).toBe(
			"https://git.nemsis.org/scm/nep/nemsis_public.git",
		);
	});

	it("pins exactly the supported versions to full commit SHAs", () => {
		expect(Object.keys(lock.versions).sort()).toEqual(
			[...SUPPORTED_VERSIONS].sort(),
		);
		for (const v of Object.values(lock.versions)) {
			expect(v.commit).toMatch(/^[0-9a-f]{40}$/);
		}
	});

	it("has a committed manifest for every version that covers the dataset entry XSDs", () => {
		for (const version of Object.keys(lock.versions)) {
			const m = lock.manifest(version);
			for (const entry of [
				"EMSDataSet_v3.xsd",
				"DEMDataSet_v3.xsd",
				"StateDataSet_v3.xsd",
			]) {
				expect(m.has(`XSDs/NEMSIS_XSDs/${entry}`), `${version} ${entry}`).toBe(
					true,
				);
			}
		}
	});
});

describe("newerReleaseTags", () => {
	const locked = ["3.5.0.251001CP6", "3.5.1.251001CP2"];

	it("ignores tags already locked or older than the newest locked release", () => {
		expect(
			newerReleaseTags(
				[
					"3.4.0.200910CP2",
					"3.5.0.250403CP5",
					"3.5.0.251001CP6",
					"3.5.1.251001CP2",
				],
				locked,
			),
		).toEqual([]);
	});

	it("reports new 3.5.x releases, sorted by release date", () => {
		expect(
			newerReleaseTags(
				[
					"3.5.2.270115",
					"3.5.1.260401CP3",
					"3.5.1.251001CP2",
					"not-a-release",
					"3.6.0.270101",
				],
				locked,
			),
		).toEqual(["3.5.1.260401CP3", "3.5.2.270115"]);
	});
});
