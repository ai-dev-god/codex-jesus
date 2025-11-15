"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const logger_1 = require("../../observability/logger");
const http_error_1 = require("./http-error");
const DEFAULT_ERROR_MESSAGE = 'Internal server error';
const DEFAULT_ERROR_CODE = 'UNKNOWN_ERROR';
const resolveStatus = (error) => {
    const status = (error.status ?? error.statusCode) ?? 500;
    return status >= 400 && status < 600 ? status : 500;
};
const safeMessage = (error, status) => {
    if (status >= 500) {
        return DEFAULT_ERROR_MESSAGE;
    }
    return error.message;
};
const errorHandler = (error, req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }
    const status = resolveStatus(error);
    const traceId = res.locals.requestId ?? req.headers['x-request-id'];
    const code = error instanceof http_error_1.HttpError ? error.code ?? DEFAULT_ERROR_CODE : error.code ?? DEFAULT_ERROR_CODE;
    const logger = req.log ?? res.locals.logger ?? logger_1.baseLogger.with({ component: 'error-handler', traceId });
    const logContext = {
        method: req.method,
        path: req.originalUrl,
        status,
        code,
        message: error.message,
        traceId,
        details: error.details
    };
    if (status >= 500) {
        logger.error('Internal server error', {
            ...logContext,
            stack: error.stack
        });
    }
    else {
        logger.warn('Client error', logContext);
    }
    res.status(status).json({
        error: {
            message: safeMessage(error, status),
            status,
            code,
            traceId
        }
    });
};
exports.errorHandler = errorHandler;
