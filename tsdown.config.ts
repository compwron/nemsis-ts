import { defineConfig } from "tsdown";

export default defineConfig({
	// One entry per NEMSIS version so consumers load only the schema data they import.
	entry: {
		index: "src/index.ts",
		"3.5.0": "src/3.5.0.ts",
		"3.5.1": "src/3.5.1.ts",
		validate: "src/validate.ts",
		node: "src/node.ts",
	},
	format: ["esm"],
	platform: "neutral",
	dts: true,
	clean: true,
});
