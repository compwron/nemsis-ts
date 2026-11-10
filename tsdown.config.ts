import { defineConfig } from "tsdown";
import { bundleXsdPlugin } from "./scripts/build/xsd-bundle.ts";

/** `NEMSIS_BUNDLE_XSD=1` embeds the (verified) NEMSIS XSDs in `nemsis-ts/<version>/xsd`. */
const bundleXsd = Boolean(process.env.NEMSIS_BUNDLE_XSD);

export default defineConfig({
	// One entry per NEMSIS version so consumers load only the schema data they import.
	entry: {
		index: "src/index.ts",
		"3.5.0": "src/3.5.0.ts",
		"3.5.1": "src/3.5.1.ts",
		"3.5.0/xsd": "src/xsd/v3_5_0.ts",
		"3.5.1/xsd": "src/xsd/v3_5_1.ts",
		validate: "src/validate.ts",
		node: "src/node.ts",
	},
	format: ["esm"],
	platform: "neutral",
	// Node built-ins are only used by the `nemsis-ts/node` entry; keep them as imports.
	deps: { neverBundle: [/^node:/] },
	plugins: bundleXsd ? [bundleXsdPlugin()] : [],
	dts: true,
	clean: true,
});
