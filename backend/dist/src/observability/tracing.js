"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finishTraceContext = exports.createTraceContext = void 0;
const crypto_1 = require("crypto");
const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;
const randomHex = (bytes) => (0, crypto_1.randomBytes)(bytes).toString('hex');
const createTraceContext = (name, parent) => ({
    traceId: parent?.traceId ?? randomHex(TRACE_ID_BYTES),
    spanId: randomHex(SPAN_ID_BYTES),
    parentSpanId: parent?.spanId,
    name,
    startTime: new Date().toISOString(),
    attributes: {}
});
exports.createTraceContext = createTraceContext;
const finishTraceContext = (trace, attributes) => {
    trace.endTime = new Date().toISOString();
    if (attributes) {
        trace.attributes = {
            ...(trace.attributes ?? {}),
            ...attributes
        };
    }
    return trace;
};
exports.finishTraceContext = finishTraceContext;
