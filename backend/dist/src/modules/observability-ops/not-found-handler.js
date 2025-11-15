"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = void 0;
const http_error_1 = require("./http-error");
const notFoundHandler = (req, _res, next) => {
    next(new http_error_1.HttpError(404, `Resource not found for ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
};
exports.notFoundHandler = notFoundHandler;
