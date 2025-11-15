"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alerting = void 0;
const logger_1 = require("../../observability/logger");
class StructuredAlertingClient {
    constructor(logger = logger_1.baseLogger.with({ component: 'alerting' })) {
        this.logger = logger;
    }
    async notify(event, payload) {
        this.logger.error(`Alert triggered: ${event}`, payload);
    }
}
exports.alerting = new StructuredAlertingClient();
