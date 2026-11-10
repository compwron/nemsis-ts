/** NEMSIS releases (nemsis_public git tags) this library is built and tested against. */
export const SUPPORTED_VERSIONS: readonly [
	"3.5.0.251001CP6",
	"3.5.1.251001CP2",
] = ["3.5.0.251001CP6", "3.5.1.251001CP2"] as const;

export type NemsisVersion = (typeof SUPPORTED_VERSIONS)[number];

export { schemas } from "./generated/index.ts";
export type * from "./generated/types.ts";
export { effectiveFacets, leaves, walk } from "./schema/model.ts";
export type * from "./schema/types.ts";
export type * from "./schema/values.ts";
