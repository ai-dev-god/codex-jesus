"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeHeaders = exports.baseLogger = exports.createLogger = void 0;
const env_1 = __importDefault(require("../config/env"));
const CLOUD_PROJECT_ENV_KEYS = ['GCLOUD_PROJECT', 'GCP_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'GCP_PROJECT_ID'];
const resolveProjectId = () => {
    if (typeof env_1.default.GCP_PROJECT_ID === 'string' && env_1.default.GCP_PROJECT_ID.length > 0) {
        return env_1.default.GCP_PROJECT_ID;
    }
    for (const key of CLOUD_PROJECT_ENV_KEYS) {
        const value = process.env[key];
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }
    return undefined;
};
const projectId = resolveProjectId();
const serviceName = 'biohax-backend';
const toTraceField = (traceId) => {
    if (!traceId) {
        return undefined;
    }
    if (!projectId || traceId.startsWith('projects/')) {
        return traceId;
    }
    return `projects/${projectId}/traces/${traceId}`;
};
const mergeLabels = (left, right) => {
    if (!left && !right) {
        return undefined;
    }
    return {
        ...(left ?? {}),
        ...(right ?? {})
    };
};
const mergeContext = (left, right) => {
    if (!left && !right) {
        return undefined;
    }
    return {
        ...(left ?? {}),
        ...(right ?? {})
    };
};
const severityToConsole = (severity) => {
    if (!severity) {
        return console.log;
    }
    switch (severity) {
        case 'ERROR':
        case 'CRITICAL':
        case 'ALERT':
        case 'EMERGENCY':
            return console.error;
        case 'WARNING':
            return console.warn;
        default:
            return console.log;
    }
};
const serializeHeaders = (headers) => {
    const output = {};
    for (const [key, value] of Object.entries(headers)) {
        if (typeof value === 'undefined') {
            continue;
        }
        output[key] = value;
    }
    return output;
};
exports.serializeHeaders = serializeHeaders;
const normaliseHttpRequest = (payload) => {
    if (!payload) {
        return undefined;
    }
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => typeof value !== 'undefined'));
};
class StructuredLogger {
    constructor(context = {}) {
        this.context = context;
    }
    with(options) {
        return new StructuredLogger({
            ...this.context,
            component: options.component ?? this.context.component,
            traceId: options.traceId ?? this.context.traceId,
            spanId: options.spanId ?? this.context.spanId,
            labels: mergeLabels(this.context.labels, options.labels),
            defaultFields: mergeContext(this.context.defaultFields, options.defaultFields)
        });
    }
    log(message, options = {}) {
        const timestamp = new Date().toISOString();
        const severity = options.severity;
        const traceId = options.traceId ?? this.context.traceId;
        const spanId = options.spanId ?? this.context.spanId;
        const payload = {
            message,
            severity,
            time: timestamp,
            component: this.context.component,
            context: mergeContext(this.context.defaultFields, options.context),
            labels: mergeLabels(this.context.labels, options.labels),
            'logging.googleapis.com/trace': toTraceField(traceId),
            'logging.googleapis.com/spanId': spanId,
            httpRequest: normaliseHttpRequest(options.httpRequest)
        };
        const entry = {
            serviceContext: {
                service: serviceName
            },
            ...payload
        };
        const writer = severityToConsole(severity);
        writer.call(console, JSON.stringify(entry));
    }
    debug(message, context) {
        this.log(message, { severity: 'DEBUG', context });
    }
    info(message, context) {
        this.log(message, { severity: 'INFO', context });
    }
    warn(message, context) {
        this.log(message, { severity: 'WARNING', context });
    }
    error(message, context) {
        this.log(message, { severity: 'ERROR', context });
    }
}
const createLogger = (context = {}) => new StructuredLogger(context);
exports.createLogger = createLogger;
exports.baseLogger = (0, exports.createLogger)({ component: 'backend' });
