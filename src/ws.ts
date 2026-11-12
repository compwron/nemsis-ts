/**
 * NEMSIS V3 web-service client (SOAP over HTTPS: SubmitData, RetrieveStatus, QueryLimit).
 * Import as `nemsis-ts/ws`.
 */
export {
	createNemsisWsClient,
	type NemsisWsClient,
	type WaitOptions,
	type WsClientOptions,
} from "./ws/client.ts";
export {
	NemsisWsError,
	NemsisWsFaultError,
	NemsisWsHttpError,
	NemsisWsRequestError,
	NemsisWsResponseError,
	NemsisWsTimeoutError,
} from "./ws/errors.ts";
export {
	DATA_SCHEMA,
	parseQueryLimitResponse,
	parseRetrieveStatusResponse,
	parseSubmitDataResponse,
	queryLimitRequest,
	type RetrieveStatusRequestInput,
	retrieveStatusRequest,
	type SubmitDataRequestInput,
	submitDataRequest,
	WS_NS,
	type WsCredentials,
	type WsCustomReport,
	type WsDataSchemaName,
	type WsQueryLimitResult,
	type WsResult,
	type WsSubmitReport,
	type WsXmlElementInfo,
	type WsXmlValidationError,
} from "./ws/soap.ts";
export {
	WS_STATUS_CODES,
	type WsStatus,
	type WsStatusKind,
	wsStatus,
} from "./ws/status.ts";
