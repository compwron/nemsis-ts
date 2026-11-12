import { describe, expect, it } from "vitest";
import {
	createNemsisWsClient,
	type WsClientOptions,
} from "../../src/ws/client.ts";
import {
	NemsisWsFaultError,
	NemsisWsHttpError,
	NemsisWsRequestError,
	NemsisWsResponseError,
	NemsisWsTimeoutError,
} from "../../src/ws/errors.ts";
import * as F from "./fixtures.ts";

const EMS = `<EMSDataSet xmlns="http://www.nemsis.org"><Header/></EMSDataSet>`;
const SECRET = "very-secret-password";

interface Call {
	url: string;
	init: RequestInit;
}

/** A fake fetch that answers from a queue and records what it was sent. */
function fakeFetch(
	...replies: (string | { status: number; body: string } | Error)[]
) {
	const calls: Call[] = [];
	const f = (async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		const next = replies.length > 1 ? replies.shift() : replies[0];
		if (next instanceof Error) throw next;
		const { status, body } =
			typeof next === "string"
				? { status: 200, body: next }
				: (next ?? { status: 200, body: "" });
		return new Response(body, { status });
	}) as typeof fetch;
	return { f, calls };
}

const client = (f: typeof fetch, extra: Partial<WsClientOptions> = {}) =>
	createNemsisWsClient({
		endpoint: "https://ws.example.org/nemsis",
		username: "emonster",
		password: SECRET,
		organization: "ElmoAgency",
		fetch: f,
		...extra,
	});

describe("requests on the wire", () => {
	it("POSTs the SOAP message with the right headers, no redirects, and a timeout signal", async () => {
		const { f, calls } = fakeFetch(F.SYNC_OK);
		const r = await client(f, {
			headers: { "X-Api-Key": "k", "content-type": "evil", SOAPAction: "evil" },
		}).submitData({ xml: EMS, schemaVersion: "3.5.1" });
		expect(r.statusCode).toBe(2);
		const [call] = calls;
		expect(call?.url).toBe("https://ws.example.org/nemsis");
		expect(call?.init.method).toBe("POST");
		expect(call?.init.redirect).toBe("error");
		expect(call?.init.signal).toBeInstanceOf(AbortSignal);
		const headers = call?.init.headers as Record<string, string>;
		expect(headers["Content-Type"]).toBe("text/xml; charset=utf-8");
		expect(headers.SOAPAction).toBe(`"http://ws.nemsis.org/SubmitData"`);
		expect(headers["X-Api-Key"]).toBe("k");
		expect(String(call?.init.body)).toContain("<ws:SubmitDataRequest>");
	});

	it("uses the right action for each operation and sends the original request type when polling", async () => {
		const { f, calls } = fakeFetch(F.QUERY_LIMIT, F.RETRIEVE_DONE);
		const c = client(f);
		expect((await c.queryLimit()).limitKb).toBe(5120);
		expect(
			(
				await c.retrieveStatus("12345678", {
					originalRequestType: "SubmitData",
				})
			).statusCode,
		).toBe(1);
		expect(
			calls.map((c) => (c.init.headers as Record<string, string>).SOAPAction),
		).toEqual([
			`"http://ws.nemsis.org/QueryLimit"`,
			`"http://ws.nemsis.org/RetrieveStatus"`,
		]);
		expect(String(calls[1]?.init.body)).toContain(
			"<ws:originalRequestType>SubmitData</ws:originalRequestType>",
		);
	});

	it("falls back to the global fetch", async () => {
		const original = globalThis.fetch;
		const { f, calls } = fakeFetch(F.QUERY_LIMIT);
		globalThis.fetch = f;
		try {
			await createNemsisWsClient({
				endpoint: "https://ws.example.org/",
				username: "u",
				password: "p",
				organization: "o",
			}).queryLimit();
			expect(calls).toHaveLength(1);
		} finally {
			globalThis.fetch = original;
		}
	});
});

describe("endpoint safety", () => {
	const make =
		(endpoint: string, extra: Partial<WsClientOptions> = {}) =>
		() =>
			client(fakeFetch("").f, { endpoint, ...extra });
	it("requires https, except for localhost or an explicit opt-in", () => {
		expect(make("http://ws.example.org/")).toThrow(NemsisWsRequestError);
		expect(make("ftp://ws.example.org/")).toThrow(/must use https/);
		for (const ok of [
			"https://ws.example.org/",
			"http://localhost:8080/ws",
			"http://127.0.0.1/ws",
			"http://[::1]/ws",
		]) {
			expect(make(ok), ok).not.toThrow();
		}
		expect(
			make("http://ws.example.org/", { allowInsecureHttp: true }),
		).not.toThrow();
	});

	it("rejects invalid URLs and credentials embedded in the URL, without echoing them", () => {
		expect(make("not a url")).toThrow(/not a valid URL/);
		try {
			make("https://user:hunter2@ws.example.org/")();
			expect.unreachable();
		} catch (e) {
			expect((e as Error).message).toMatch(/must not contain credentials/);
			expect((e as Error).message).not.toContain("hunter2");
		}
	});
});

describe("failures", () => {
	it("a SOAP fault arriving with HTTP 500 becomes NemsisWsFaultError", async () => {
		const { f } = fakeFetch({ status: 500, body: F.FAULT_11 });
		await expect(client(f).queryLimit()).rejects.toBeInstanceOf(
			NemsisWsFaultError,
		);
	});

	it("an HTTP error without a SOAP message becomes NemsisWsHttpError with a short snippet", async () => {
		const { f } = fakeFetch({
			status: 503,
			body: `<html>${"x".repeat(500)}</html>`,
		});
		const error = await client(f)
			.queryLimit()
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NemsisWsHttpError);
		expect(error).toMatchObject({ status: 503 });
		expect((error as NemsisWsHttpError).bodySnippet).toHaveLength(200);
	});

	it("a 200 that is not SOAP is a response error", async () => {
		const { f } = fakeFetch("<html/>");
		await expect(client(f).queryLimit()).rejects.toBeInstanceOf(
			NemsisWsResponseError,
		);
	});

	it("network errors propagate; no error message ever contains the password", async () => {
		const messages: string[] = [];
		for (const reply of [
			new TypeError("fetch failed"),
			{ status: 503, body: "down" },
			"<html/>",
			{ status: 500, body: F.FAULT_11 },
		]) {
			const e = await client(fakeFetch(reply).f)
				.queryLimit()
				.catch((x: unknown) => x as Error);
			messages.push((e as Error).message, String((e as Error).stack));
		}
		const e = await client(fakeFetch("").f, { password: "p".repeat(300) })
			.queryLimit()
			.catch((x: unknown) => x as Error);
		messages.push((e as Error).message);
		expect(messages.join("\n")).not.toContain(SECRET);
		expect(messages.join("\n")).not.toContain("p".repeat(300));
	});

	it("a request that cannot be built never reaches the network", async () => {
		const { f, calls } = fakeFetch(F.QUERY_LIMIT);
		await expect(
			client(f).submitData({ xml: "<bad", schemaVersion: "3.5.1" }),
		).rejects.toBeInstanceOf(NemsisWsRequestError);
		expect(calls).toHaveLength(0);
	});

	it("times out, and honours the caller's abort signal", async () => {
		const hang = ((_u: unknown, init?: RequestInit) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () =>
					reject(init.signal?.reason),
				);
			})) as typeof fetch;
		await expect(
			client(hang, { timeoutMs: 20 }).queryLimit(),
		).rejects.toMatchObject({ name: "TimeoutError" });
		const controller = new AbortController();
		const pending = client(hang).queryLimit({ signal: controller.signal });
		controller.abort(new Error("stop"));
		await expect(pending).rejects.toThrow("stop");
	});
});

describe("waiting for results", () => {
	const wait = { pollIntervalMs: 1000, timeoutMs: 10_000 };
	const clock = () => {
		let t = 0;
		const slept: number[] = [];
		return {
			slept,
			now: () => t,
			sleep: async (ms: number) => {
				slept.push(ms);
				t += ms;
			},
		};
	};

	it("polls until the server stops saying pending", async () => {
		const { f, calls } = fakeFetch(
			F.RETRIEVE_PENDING,
			F.RETRIEVE_PENDING,
			F.RETRIEVE_DONE,
		);
		const c = clock();
		const r = await client(f).waitForResult("12345678", {
			...wait,
			now: c.now,
			sleep: c.sleep,
		});
		expect(r.statusCode).toBe(1);
		expect(c.slept).toEqual([1000, 1000]);
		expect(calls).toHaveLength(3);
		expect(String(calls[0]?.init.body)).toContain(
			"<ws:originalRequestType>SubmitData</ws:originalRequestType>",
		);
	});

	it("gives up with NemsisWsTimeoutError carrying the handle", async () => {
		const { f } = fakeFetch(F.RETRIEVE_PENDING);
		const c = clock();
		const error = await client(f)
			.waitForResult("12345678", {
				...wait,
				timeoutMs: 2500,
				now: c.now,
				sleep: c.sleep,
			})
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NemsisWsTimeoutError);
		expect(error).toMatchObject({ requestHandle: "12345678" });
		expect(c.slept).toEqual([1000, 1000]);
	});

	it("submitAndWait returns a finished submission at once, and otherwise follows the handle", async () => {
		const done = fakeFetch(F.SYNC_OK);
		expect(
			(await client(done.f).submitAndWait({ xml: EMS, schemaVersion: "3.5.1" }))
				.statusCode,
		).toBe(2);
		expect(done.calls).toHaveLength(1);

		const slow = fakeFetch(F.PENDING, F.RETRIEVE_PENDING, F.RETRIEVE_DONE);
		const c = clock();
		const r = await client(slow.f).submitAndWait(
			{ xml: EMS, schemaVersion: "3.5.1" },
			{ ...wait, now: c.now, sleep: c.sleep },
		);
		expect(r).toMatchObject({ statusCode: 1, requestHandle: "12345678" });
		expect(String(slow.calls[1]?.init.body)).toContain(
			"<ws:requestHandle>12345678</ws:requestHandle>",
		);
	});

	it("submitAndWait rejects a pending answer that has no handle", async () => {
		const noHandle = F.PENDING.replace(
			"<requestHandle> 12345678 </requestHandle>",
			"<requestHandle></requestHandle>",
		);
		await expect(
			client(fakeFetch(noHandle).f).submitAndWait({
				xml: EMS,
				schemaVersion: "3.5.1",
			}),
		).rejects.toThrow(/no requestHandle/);
	});

	it("the real sleep can be aborted", async () => {
		const { f } = fakeFetch(F.RETRIEVE_PENDING);
		const controller = new AbortController();
		const pending = client(f).waitForResult("1", {
			pollIntervalMs: 60_000,
			timeoutMs: 600_000,
			signal: controller.signal,
		});
		setTimeout(() => controller.abort(new Error("cancelled")), 30);
		await expect(pending).rejects.toThrow("cancelled");
		const already = new AbortController();
		already.abort(new Error("early"));
		await expect(
			client(f).waitForResult("1", {
				pollIntervalMs: 60_000,
				timeoutMs: 600_000,
				signal: already.signal,
			}),
		).rejects.toThrow();
	});

	it("the real sleep resolves after the interval", async () => {
		const { f } = fakeFetch(F.RETRIEVE_PENDING, F.RETRIEVE_DONE);
		const started = Date.now();
		const r = await client(f).waitForResult("1", {
			pollIntervalMs: 30,
			timeoutMs: 5000,
		});
		expect(r.statusCode).toBe(1);
		expect(Date.now() - started).toBeGreaterThanOrEqual(25);
	});
});
