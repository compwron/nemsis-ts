/**
 * NEMSIS 3.5.0 defined lists (suggested code sets). Import as `nemsis-ts/3.5.0/lists`.
 * Kept out of `nemsis-ts/3.5.0` so apps that do not need them do not load them.
 */
import { lists } from "../generated/v3_5_0/lists.ts";
import { createListIndex, type ListIndex } from "./index.ts";

export type * from "./types.ts";
export const definedLists: ListIndex = createListIndex(lists);
