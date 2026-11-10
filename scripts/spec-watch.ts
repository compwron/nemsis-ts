/** Print (one per line) NEMSIS 3.5.x release tags newer than everything in the lock. */
import { listReleaseTags } from "./lib/fetch.ts";
import { newerReleaseTags, readLock } from "./lib/spec.ts";

const lock = readLock();
for (const t of newerReleaseTags(
	listReleaseTags(lock.repository),
	Object.keys(lock.versions),
))
	console.log(t);
