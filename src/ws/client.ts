/**
 * A client for the NEMSIS V3 web services (SOAP over HTTPS): SubmitData, RetrieveStatus and
 * QueryLimit. It only needs `fetch`, so it runs in Node 22+ and in browsers (subject to the
 * server's CORS policy).
 *
 * Safe by default: HTTPS only (plain HTTP just for localhost, or with `allowInsecureHttp`),
 * redirects are refused (the credentials travel in the request body and must not be forwarded),
 * and credentials never appear in thrown errors.
 */
import {
	NemsisWsHttpError,
	NemsisWsRequestError,
	NemsisWsResponseError,
	NemsisWsTimeoutError,
} from "./errors.ts";
import {
	parseQueryLimitResponse,
	parseRetrieveStatusResponse,
	parseSubmitDataResponse,
	queryLimitRequest,
	retrieveStatusRequest,
	type SubmitDataRequestInput,
	soapAction,
	submitDataRequest,
	type WsCredentials,
	type WsOperation,
	type WsQueryLimitResult,
	type WsResult,
} from "./soap.ts";

export interface WsClientOptions extends WsCredentials {
	/** The server's endpoint, e.g. `https://validator.nemsis.org/` (the reference validator). */
	readonly endpoint: string;
	/** Defaults to the global `fetch`. */
	readonly fetch?: typeof fetch;
	/** Per-request timeout in milliseconds (default 60 000). */
	readonly timeoutMs?: number;
	/** Allow a non-HTTPS endpoint that is not localhost. Only for tests against a trusted network. */
	readonly allowInsecureHttp?: boolean;
	/** Extra HTTP headers (for example a gateway API key). `Content-Type` and `SOAPAction` are fixed. */
	readonly headers?: Readonly<Record<string, string>>;
}

export interface WaitOptions {
	/** Pause between status checks (default 5000 ms). */
	readonly pollIntervalMs?: number;
	/** Give up after this long (default 5 minutes) with `NemsisWsTimeoutError`. */
	readonly timeoutMs?: number;
	readonly signal?: AbortSignal;
	/** For tests: replace the clock and the sleep. */
	readonly now?: () => number;
	readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface NemsisWsClient {
	/** Send a NEMSIS document. A `pending` status means: call `waitForResult` with the handle. */
	submitData(
		input: SubmitDataRequestInput,
		options?: { signal?: AbortSignal },
	): Promise<WsResult>;
	/** Ask for the outcome of an earlier request. */
	retrieveStatus(
		requestHandle: string,
		options?: { originalRequestType?: string; signal?: AbortSignal },
	): Promise<WsResult>;
	/** The server's data-payload size limit. */
	queryLimit(options?: { signal?: AbortSignal }): Promise<WsQueryLimitResult>;
	/** Poll `retrieveStatus` until the server is no longer pending. */
	waitForResult(
		requestHandle: string,
		options?: WaitOptions,
	): Promise<WsResult>;
	/** `submitData`, then `waitForResult` if the server answered `pending`. */
	submitAndWait(
		input: SubmitDataRequestInput,
		options?: WaitOptions,
	): Promise<WsResult>;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function checkEndpoint(endpoint: string, allowInsecureHttp: boolean): string {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		throw new NemsisWsRequestError("endpoint is not a valid URL");
	}
	const secure =
		url.protocol === "https:" ||
		(url.protocol === "http:" &&
			(allowInsecureHttp || LOCAL_HOSTS.has(url.hostname)));
	if (!secure) {
		throw new NemsisWsRequestError(
			"endpoint must use https:// (credentials and patient data are sent in the request); http:// is only accepted for localhost or with allowInsecureHttp",
		);
	}
	if (url.username || url.password) {
		throw new NemsisWsRequestError(
			"endpoint must not contain credentials; pass them as options",
		);
	}
	return url.href;
}

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
	new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason);
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason);
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});

export function createNemsisWsClient(options: WsClientOptions): NemsisWsClient {
	const endpoint = checkEndpoint(
		options.endpoint,
		options.allowInsecureHttp ?? false,
	);
	const credentials: WsCredentials = {
		username: options.username,
		password: options.password,
		organization: options.organization,
	};
	const timeoutMs = options.timeoutMs ?? 60_000;

	async function send(
		operation: WsOperation,
		body: string,
		signal?: AbortSignal,
	): Promise<string> {
		const doFetch = options.fetch ?? globalThis.fetch;
		const timeout = AbortSignal.timeout(timeoutMs);
		const response = await doFetch(endpoint, {
			method: "POST",
			redirect: "error",
			headers: {
				...options.headers,
				"Content-Type": "text/xml; charset=utf-8",
				Accept: "text/xml, application/soap+xml",
				SOAPAction: soapAction(operation),
			},
			body,
			signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
		});
		const text = await response.text();
		// A SOAP fault arrives with HTTP 500, so the body is parsed before the status is judged.
		if (!response.ok && !/<(?:[\w.-]+:)?Envelope[\s>]/.test(text)) {
			throw new NemsisWsHttpError(response.status, text.slice(0, 200));
		}
		return text;
	}

	const client: NemsisWsClient = {
		async submitData(input, opts) {
			const body = submitDataRequest(credentials, input);
			return parseSubmitDataResponse(
				await send("SubmitData", body, opts?.signal),
			);
		},
		async retrieveStatus(requestHandle, opts) {
			const body = retrieveStatusRequest(credentials, {
				requestHandle,
				...(opts?.originalRequestType === undefined
					? {}
					: { originalRequestType: opts.originalRequestType }),
			});
			return parseRetrieveStatusResponse(
				await send("RetrieveStatus", body, opts?.signal),
			);
		},
		async queryLimit(opts) {
			return parseQueryLimitResponse(
				await send("QueryLimit", queryLimitRequest(credentials), opts?.signal),
			);
		},
		async waitForResult(requestHandle, opts = {}) {
			const interval = opts.pollIntervalMs ?? 5000;
			const limit = opts.timeoutMs ?? 5 * 60_000;
			const now = opts.now ?? Date.now;
			const sleep = opts.sleep ?? defaultSleep;
			const started = now();
			for (;;) {
				const result = await client.retrieveStatus(requestHandle, {
					originalRequestType: "SubmitData",
					...(opts.signal ? { signal: opts.signal } : {}),
				});
				if (result.status.kind !== "pending") return result;
				if (now() - started + interval > limit)
					throw new NemsisWsTimeoutError(requestHandle, limit);
				await sleep(interval, opts.signal);
			}
		},
		async submitAndWait(input, opts = {}) {
			const submitted = await client.submitData(
				input,
				opts.signal ? { signal: opts.signal } : {},
			);
			if (submitted.status.kind !== "pending") return submitted;
			if (submitted.requestHandle === "")
				throw new NemsisWsResponseError(
					"The server reported pending but returned no requestHandle",
				);
			return client.waitForResult(submitted.requestHandle, opts);
		},
	};
	return client;
}
