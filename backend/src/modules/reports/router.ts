import { Router } from 'express';

import { requireActiveUser, requireAuth } from '../identity/guards';
import { labReportService } from '../lab-upload/lab-report.service';
import { HttpError } from '../observability-ops/http-error';

const router = Router();

router.use(requireAuth, requireActiveUser);

router.get('/labs/:uploadId', async (req, res, next) => {
  const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : 'json';
  const uploadId = req.params.uploadId;

  try {
    const report = await labReportService.buildReport(req.user!.id, uploadId);

    if (format === 'csv') {
      const csv = await labReportService.buildCsv(report);
      res
        .status(200)
        .type('text/csv')
        .attachment(`lab-report-${report.upload.id}.csv`)
        .send(csv);
      return;
    }

    if (format === 'pdf') {
      const pdf = await labReportService.buildPdf(report);
      res
        .status(200)
        .type('application/pdf')
        .attachment(`lab-report-${report.upload.id}.pdf`)
        .send(pdf);
      return;
    }

    res.status(200).json(report);
  } catch (error) {
    next(
      error instanceof HttpError
        ? error
        : new HttpError(500, 'Unable to generate lab report', 'LAB_REPORT_FAILED', {
            uploadId,
            cause: error instanceof Error ? error.message : error
          })
    );
  }
});

export { router as reportsRouter };

