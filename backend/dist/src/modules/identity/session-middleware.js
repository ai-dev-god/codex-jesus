"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionMiddleware = void 0;
const token_service_1 = require("./token-service");
const BEARER_PREFIX = 'bearer ';
const sessionMiddleware = (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith(BEARER_PREFIX)) {
        const token = authHeader.slice(BEARER_PREFIX.length).trim();
        const decoded = token_service_1.tokenService.decodeAccessToken(token);
        if (decoded) {
            req.user = {
                id: decoded.sub,
                email: decoded.email,
                role: decoded.role,
                status: decoded.status
            };
        }
    }
    next();
};
exports.sessionMiddleware = sessionMiddleware;
