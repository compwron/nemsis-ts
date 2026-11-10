/**
 * Fetch the pinned NEMSIS artifacts into `.spec/<version>/` and verify them.
 *
 *   node scripts/fetch-spec.ts                    # fetch missing versions, verify all
 *   node scripts/fetch-spec.ts --write-manifests  # (maintainers) regenerate spec/manifests/*
 *
 * Exits non-zero if a commit or any file hash does not match the lock.
 */
import { syncVersions } from "./lib/fetch.ts";

process.exit(
	syncVersions({ writeManifests: process.argv.includes("--write-manifests") })
		? 0
		: 1,
);
