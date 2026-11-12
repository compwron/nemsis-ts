/** SOAP response fixtures, modelled on the examples in NEMSIS's V3 Web Services Guide. */
const S = `xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"`;
const WS = `xmlns="http://ws.nemsis.org/"`;
const soap = (body: string) =>
	`<S:Envelope ${S}><S:Body>${body}</S:Body></S:Envelope>`;

export const SVRL: string = `<svrl:schematron-output xmlns:svrl="http://purl.oclc.org/dsdl/svrl" title="T"><svrl:failed-assert test="x" id="nemSch_e002" role="[ERROR]" location="/a"><svrl:text>Msg</svrl:text></svrl:failed-assert></svrl:schematron-output>`;

/** Guide case 1: synchronous success with an attached Schematron report. */
export const SYNC_OK: string = soap(
	`<SubmitDataResponse ${WS}><requestType>SubmitData</requestType><requestHandle>23456789</requestHandle><statusCode>2</statusCode><reports><xmlValidationErrorReport><totalErrorCount>0</totalErrorCount></xmlValidationErrorReport><schematronReport><completeSchematronReport><completeReport><payloadOfXmlElement>${SVRL}</payloadOfXmlElement></completeReport></completeSchematronReport></schematronReport></reports></SubmitDataResponse>`,
);

/** Guide case 2: the server is busy; whitespace around values as in the guide. */
export const PENDING: string = soap(
	`<SubmitDataResponse ${WS}><requestType>SubmitData</requestType><requestHandle> 12345678 </requestHandle><statusCode>0</statusCode></SubmitDataResponse>`,
);

export const RETRIEVE_PENDING: string = soap(
	`<RetrieveStatusResponse ${WS}><requestType>RetrieveStatus</requestType><statusCode>10</statusCode><requestHandle>12345678</requestHandle></RetrieveStatusResponse>`,
);

export const RETRIEVE_DONE: string = soap(
	`<RetrieveStatusResponse ${WS}><requestType>RetrieveStatus</requestType><statusCode>1</statusCode><requestHandle>12345678</requestHandle><originalRequestType>SubmitData</originalRequestType><retrieveResult><retrieveSubmitStatus><xmlValidationErrorReport><totalErrorCount>0</totalErrorCount></xmlValidationErrorReport></retrieveSubmitStatus></retrieveResult></RetrieveStatusResponse>`,
);

/** A rejected submission: XML validation errors of both kinds, a server message and a custom report. */
export const REJECTED: string = soap(
	`<ws:SubmitDataResponse xmlns:ws="http://ws.nemsis.org/"><ws:requestType>SubmitData</ws:requestType><ws:requestHandle>99</ws:requestHandle><ws:statusCode>-12</ws:statusCode><ws:reports><ws:serverErrorReport><ws:serverErrorMessage>Disk almost full</ws:serverErrorMessage></ws:serverErrorReport><ws:xmlValidationErrorReport><ws:totalErrorCount>3</ws:totalErrorCount><ws:xmlError><ws:desc>Value out of range</ws:desc><ws:failedElementList><ws:xmlElementInfo><ws:elementName>eVitals.06</ws:elementName><ws:elementLocation><ws:line>12</ws:line><ws:column>7</ws:column><ws:xpathLocation>/EMSDataSet/Header[1]/eVitals.06</ws:xpathLocation></ws:elementLocation><ws:value>ABC</ws:value></ws:xmlElementInfo><ws:xmlElementInfo><ws:elementName>eVitals.07</ws:elementName><ws:elementLocationUnknown>Yes</ws:elementLocationUnknown></ws:xmlElementInfo></ws:failedElementList></ws:xmlError><ws:xmlError><ws:desc>Not XML</ws:desc><ws:xmlGeneralErrorList><ws:errorMessage>Content is not allowed in prolog.</ws:errorMessage><ws:errorMessage>Second message</ws:errorMessage></ws:xmlGeneralErrorList></ws:xmlError></ws:xmlValidationErrorReport><ws:customReport><ws:reportType>ETL</ws:reportType><ws:customReport><ws:payloadOfXmlElement><etl xmlns="urn:example"><rule id="1"/></etl></ws:payloadOfXmlElement></ws:customReport></ws:customReport></ws:reports></ws:SubmitDataResponse>`,
);

export const QUERY_LIMIT: string = soap(
	`<QueryLimitResponse ${WS}><requestType>QueryLimit</requestType><limit>5120</limit><statusCode>51</statusCode></QueryLimitResponse>`,
);

export const FAULT_11: string = soap(
	`<S:Fault><faultcode>S:Server</faultcode><faultstring>Internal error</faultstring></S:Fault>`,
);

export const FAULT_12: string = `<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Body><env:Fault><env:Code><env:Value>env:Receiver</env:Value></env:Code><env:Reason><env:Text xml:lang="en">Overloaded</env:Text></env:Reason></env:Fault></env:Body></env:Envelope>`;
