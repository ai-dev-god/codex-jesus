"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resendEmailClient = exports.createResendClient = void 0;
const resend_1 = require("resend");
const env_1 = __importDefault(require("../../config/env"));
class ResendSdkClient {
    constructor(client) {
        this.client = client;
        this.mode = 'live';
    }
    async sendEmail(payload) {
        const options = {
            from: payload.from ?? 'BioHax <notifications@biohax.app>',
            to: Array.isArray(payload.to) ? payload.to : [payload.to],
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
            headers: payload.headers,
            tags: payload.tags
        };
        if (payload.replyTo) {
            options.reply_to = payload.replyTo;
        }
        const response = await this.client.emails.send(options);
        const data = response.data;
        const id = data && typeof data.id === 'string' ? data.id : null;
        return { id };
    }
}
class FallbackResendClient {
    constructor(logger = console) {
        this.logger = logger;
        this.mode = 'fallback';
    }
    async sendEmail(payload) {
        this.logger.warn?.('[notifications] Resend API key not configured; logging email instead', {
            to: payload.to,
            subject: payload.subject
        });
        return { id: null };
    }
}
const createResendClient = (apiKey = env_1.default.RESEND_API_KEY, logger = console) => {
    if (!apiKey) {
        return new FallbackResendClient(logger);
    }
    return new ResendSdkClient(new resend_1.Resend(apiKey));
};
exports.createResendClient = createResendClient;
exports.resendEmailClient = (0, exports.createResendClient)();
