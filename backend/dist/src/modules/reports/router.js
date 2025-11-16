"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportsRouter = void 0;
const express_1 = require("express");
const guards_1 = require("../identity/guards");
const lab_report_service_1 = require("../lab-upload/lab-report.service");
const http_error_1 = require("../observability-ops/http-error");
const router = (0, express_1.Router)();
exports.reportsRouter = router;
router.use(guards_1.requireAuth, guards_1.requireActiveUser);
router.get('/labs/:uploadId', async (req, res, next) => {
    const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : 'json';
    const uploadId = req.params.uploadId;
    try {
        const report = await lab_report_service_1.labReportService.buildReport(req.user.id, uploadId);
        if (format === 'csv') {
            const csv = await lab_report_service_1.labReportService.buildCsv(report);
            res
                .status(200)
                .type('text/csv')
                .attachment(`lab-report-${report.upload.id}.csv`)
                .send(csv);
            return;
        }
        if (format === 'pdf') {
            const pdf = await lab_report_service_1.labReportService.buildPdf(report);
            res
                .status(200)
                .type('application/pdf')
                .attachment(`lab-report-${report.upload.id}.pdf`)
                .send(pdf);
            return;
        }
        res.status(200).json(report);
    }
    catch (error) {
        next(error instanceof http_error_1.HttpError
            ? error
            : new http_error_1.HttpError(500, 'Unable to generate lab report', 'LAB_REPORT_FAILED', {
                uploadId,
                cause: error instanceof Error ? error.message : error
            }));
    }
});
