"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiInterpretationService = exports.AiInterpretationService = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const lab_report_service_1 = require("../lab-upload/lab-report.service");
const http_error_1 = require("../observability-ops/http-error");
class AiInterpretationService {
    constructor(prisma = prisma_1.default) {
        this.prisma = prisma;
    }
    async generate(userId, uploadId) {
        const profile = await this.prisma.profile.findUnique({
            where: { userId },
            select: { aiInterpretationApprovedAt: true }
        });
        if (!profile?.aiInterpretationApprovedAt) {
            throw new http_error_1.HttpError(403, 'Practitioner approval is required before viewing AI interpretations.', 'AI_INTERPRETATION_REQUIRES_APPROVAL');
        }
        const report = await lab_report_service_1.labReportService.buildReport(userId, uploadId);
        const focusMeasurement = report.measurements.find((measurement) => measurement.deltaPercentage !== null);
        const summary = focusMeasurement
            ? `${focusMeasurement.markerName} shifted ${focusMeasurement.deltaPercentage}% compared to the prior panel. Continue the linked ${report.plan?.title ?? 'protocol'} and retest within 4 weeks.`
            : 'No significant biomarker movement detected since the prior panel. Continue adherence and retest next month.';
        const recommendations = report.bestPractices.length > 0
            ? report.bestPractices.slice(0, 3)
            : ['Maintain your current protocol cadence and keep sleep + recovery windows consistent.'];
        return {
            uploadId,
            generatedAt: new Date().toISOString(),
            summary,
            recommendations,
            citation: {
                label: report.upload.fileName ?? report.upload.id,
                reportUrl: `/reports/labs/${uploadId}?format=pdf`
            }
        };
    }
}
exports.AiInterpretationService = AiInterpretationService;
exports.aiInterpretationService = new AiInterpretationService();
