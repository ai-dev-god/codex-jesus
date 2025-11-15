"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireActiveUser = exports.requireAdmin = exports.requireRoles = exports.requireAuth = void 0;
const client_1 = require("@prisma/client");
const http_error_1 = require("../observability-ops/http-error");
const unauthenticated = () => new http_error_1.HttpError(401, 'Authentication required', 'UNAUTHENTICATED');
const forbidden = () => new http_error_1.HttpError(403, 'You do not have permission to perform this action', 'FORBIDDEN');
const onboardingRequired = () => new http_error_1.HttpError(403, 'Complete onboarding to continue', 'ONBOARDING_REQUIRED');
const requireAuth = (req, _res, next) => {
    if (!req.user) {
        next(unauthenticated());
        return;
    }
    next();
};
exports.requireAuth = requireAuth;
const requireRoles = (...roles) => {
    return (req, _res, next) => {
        if (!req.user) {
            next(unauthenticated());
            return;
        }
        if (!roles.includes(req.user.role)) {
            next(forbidden());
            return;
        }
        next();
    };
};
exports.requireRoles = requireRoles;
exports.requireAdmin = (0, exports.requireRoles)(client_1.Role.ADMIN);
const requireActiveUser = (req, _res, next) => {
    if (!req.user) {
        next(unauthenticated());
        return;
    }
    if (req.user.status !== client_1.UserStatus.ACTIVE) {
        next(onboardingRequired());
        return;
    }
    next();
};
exports.requireActiveUser = requireActiveUser;
