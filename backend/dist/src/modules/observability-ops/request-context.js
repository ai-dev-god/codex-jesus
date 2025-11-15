"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestContext = void 0;
const crypto_1 = require("crypto");
const REQUEST_ID_HEADER = 'x-request-id';
const CLOUD_TRACE_HEADER = 'x-cloud-trace-context';
const randomSpanId = () => (0, crypto_1.randomBytes)(8).toString('hex');
const parseCloudTraceHeader = (headerValue) => {
    if (!headerValue) {
        return undefined;
    }
    const [traceId, remainder] = headerValue.split('/');
    if (!traceId) {
        return undefined;
    }
    const spanToken = remainder?.split(';')[0];
    const spanId = spanToken && spanToken.length > 0 ? spanToken : randomSpanId();
    return {
        traceId,
        spanId,
        startTime: new Date().toISOString(),
        attributes: {}
    };
};
const requestContext = (req, res, next) => {
    const headerKey = REQUEST_ID_HEADER;
    const existingHeader = req.headers[headerKey];
    const requestId = typeof existingHeader === 'string' && existingHeader.length > 0 ? existingHeader : (0, crypto_1.randomUUID)();
    res.locals.requestId = requestId;
    req.requestId = requestId;
    if (!existingHeader) {
        req.headers[headerKey] = requestId;
    }
    const cloudTraceValue = req.get(CLOUD_TRACE_HEADER);
    const parentTrace = parseCloudTraceHeader(cloudTraceValue ?? undefined);
    if (parentTrace) {
        req.trace = parentTrace;
        res.locals.trace = parentTrace;
    }
    next();
};
exports.requestContext = requestContext;
