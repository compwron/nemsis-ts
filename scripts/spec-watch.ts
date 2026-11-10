/** Print (one per line) NEMSIS 3.5.x release tags newer than everything in the lock. */
import { execFileSync } from "node:child_process";
import { newerReleaseTags, readLock } from "./lib/spec.ts";

const lock = readLock();
const tags = execFileSync(
	"git",
	["ls-remote", "--tags", "--refs", lock.repository],
	{ encoding: "utf8" },
)
	.split("\n")
	.map((l) => l.split("refs/tags/")[1])
	.filter((t): t is string => Boolean(t));
for (const t of newerReleaseTags(tags, Object.keys(lock.versions)))
	console.log(t);
