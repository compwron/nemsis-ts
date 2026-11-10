import { describe, expect, it } from "vitest";
import { SUPPORTED_VERSIONS } from "../src/index.ts";

describe("package entry", () => {
	it("lists the NEMSIS releases it targets", () => {
		expect(SUPPORTED_VERSIONS).toEqual(["3.5.0.251001CP6", "3.5.1.251001CP2"]);
	});
});
