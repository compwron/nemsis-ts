/**
 * Generate `src/generated/` from the fetched NEMSIS XSDs (run `pnpm spec:fetch` first).
 *
 *   node scripts/codegen.ts
 */
import { generate } from "./codegen/generate.ts";

generate();
