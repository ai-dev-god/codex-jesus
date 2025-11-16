"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.earlyWarningService = exports.EarlyWarningService = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const RULES = [
    { marker: 'glucose', threshold: 105, direction: 'above', message: 'Fasting glucose trending high. Recheck metabolic inputs.' },
    { marker: 'crp', threshold: 3, direction: 'above', message: 'Inflammation marker elevated.' },
    { marker: 'hrv', threshold: 55, direction: 'below', message: 'HRV suppressed. Increase recovery blocks.' }
];
class EarlyWarningService {
    constructor(prisma = prisma_1.default) {
        this.prisma = prisma;
    }
    async detect(userId) {
        const markers = RULES.map((rule) => rule.marker);
        const measurements = await this.prisma.biomarkerMeasurement.findMany({
            where: { userId, markerName: { in: markers } },
            orderBy: { capturedAt: 'desc' }
        });
        const latest = new Map();
        measurements.forEach((measurement) => {
            const key = measurement.markerName.toLowerCase();
            if (!latest.has(key)) {
                latest.set(key, measurement);
            }
        });
        const warnings = [];
        RULES.forEach((rule) => {
            const sample = latest.get(rule.marker);
            if (!sample) {
                return;
            }
            const value = sample.value ? Number(sample.value) : null;
            if (value === null) {
                return;
            }
            if ((rule.direction === 'above' && value >= rule.threshold) ||
                (rule.direction === 'below' && value <= rule.threshold)) {
                warnings.push({
                    markerName: sample.markerName,
                    value,
                    unit: sample.unit ?? null,
                    message: rule.message,
                    capturedAt: sample.capturedAt?.toISOString() ?? null
                });
            }
        });
        return warnings;
    }
}
exports.EarlyWarningService = EarlyWarningService;
exports.earlyWarningService = new EarlyWarningService();
