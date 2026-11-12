/** Errors thrown by the NEMSIS web-service client. None of them ever contains credentials. */
export class NemsisWsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NemsisWsError";
	}
}

/** The request could not be built (bad credentials, payload or option). Nothing was sent. */
export class NemsisWsRequestError extends NemsisWsError {
	constructor(message: string) {
		super(message);
		this.name = "NemsisWsRequestError";
	}
}

/** The server answered with a SOAP fault. */
export class NemsisWsFaultError extends NemsisWsError {
	readonly faultCode: string;
	readonly faultString: string;
	constructor(faultCode: string, faultString: string) {
		super(`SOAP fault ${faultCode}: ${faultString}`);
		this.name = "NemsisWsFaultError";
		this.faultCode = faultCode;
		this.faultString = faultString;
	}
}

/** The server answered with an HTTP error that is not a SOAP message. */
export class NemsisWsHttpError extends NemsisWsError {
	readonly status: number;
	/** The start of the response body (at most 200 characters), for diagnosis. */
	readonly bodySnippet: string;
	constructor(status: number, bodySnippet: string) {
		super(`HTTP ${status} from the NEMSIS web service`);
		this.name = "NemsisWsHttpError";
		this.status = status;
		this.bodySnippet = bodySnippet;
	}
}

/** The response was not a well-formed NEMSIS web-service message. */
export class NemsisWsResponseError extends NemsisWsError {
	constructor(message: string) {
		super(message);
		this.name = "NemsisWsResponseError";
	}
}

/** `waitForResult` gave up while the server still reported the work as pending. */
export class NemsisWsTimeoutError extends NemsisWsError {
	readonly requestHandle: string;
	constructor(requestHandle: string, timeoutMs: number) {
		super(
			`Request ${requestHandle} was still pending after ${timeoutMs} ms; retrieve its status again later`,
		);
		this.name = "NemsisWsTimeoutError";
		this.requestHandle = requestHandle;
	}
}
