/**
 * NEMSIS 3.5.1 defined lists (suggested code sets). Import as `nemsis-ts/3.5.1/lists`.
 * Kept out of `nemsis-ts/3.5.1` so apps that do not need them do not load them.
 */
import { lists } from "../generated/v3_5_1/lists.ts";
import { createListIndex, type ListIndex } from "./index.ts";

export type * from "./types.ts";
export const definedLists: ListIndex = createListIndex(lists);
