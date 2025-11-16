"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.labReportService = exports.LabReportService = void 0;
const pdfkit_1 = __importDefault(require("pdfkit"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const toNumber = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
};
class LabReportService {
    constructor(prisma = prisma_1.default) {
        this.prisma = prisma;
    }
    async buildReport(userId, uploadId) {
        const upload = await this.prisma.panelUpload.findFirst({
            where: { id: uploadId, userId },
            include: {
                plan: {
                    select: { id: true, title: true, focusAreas: true }
                },
                measurements: {
                    orderBy: { markerName: 'asc' }
                }
            }
        });
        if (!upload) {
            throw new Error('Upload not found');
        }
        const measurementNames = upload.measurements.map((item) => item.markerName);
        const previousMeasurements = await this.prisma.biomarkerMeasurement.findMany({
            where: {
                userId,
                markerName: { in: measurementNames },
                panelUploadId: { not: uploadId }
            },
            orderBy: { capturedAt: 'desc' }
        });
        const previousByMarker = new Map();
        previousMeasurements.forEach((measurement) => {
            const key = measurement.markerName.toLowerCase();
            if (!previousByMarker.has(key)) {
                previousByMarker.set(key, measurement);
            }
        });
        const measurements = upload.measurements.map((measurement) => {
            const key = measurement.markerName.toLowerCase();
            const previous = previousByMarker.get(key);
            const currentValue = toNumber(measurement.value);
            const previousValue = previous ? toNumber(previous.value) : null;
            const delta = currentValue !== null && previousValue !== null && previousValue !== 0
                ? Number((((currentValue - previousValue) / Math.abs(previousValue)) * 100).toFixed(2))
                : null;
            return {
                markerName: measurement.markerName,
                unit: measurement.unit ?? null,
                value: currentValue,
                previousValue,
                previousCapturedAt: previous?.capturedAt?.toISOString() ?? null,
                deltaPercentage: delta
            };
        });
        const bestPractices = this.deriveBestPractices(measurements, upload.plan);
        return {
            upload: {
                id: upload.id,
                createdAt: upload.createdAt.toISOString(),
                storageKey: upload.storageKey,
                fileName: (upload.rawMetadata && typeof upload.rawMetadata.fileName === 'string'
                    ? upload.rawMetadata.fileName
                    : null) ?? upload.storageKey.split('/').pop() ?? upload.storageKey
            },
            plan: upload.plan
                ? {
                    id: upload.plan.id,
                    title: upload.plan.title,
                    focusAreas: upload.plan.focusAreas ?? []
                }
                : null,
            measurements,
            bestPractices,
            generatedAt: new Date().toISOString()
        };
    }
    async buildCsv(report) {
        const header = 'Marker,Value,Unit,Previous Value,Delta (%)';
        const rows = report.measurements.map((measurement) => [
            measurement.markerName,
            measurement.value ?? '',
            measurement.unit ?? '',
            measurement.previousValue ?? '',
            measurement.deltaPercentage ?? ''
        ]
            .map((cell) => `"${cell}"`)
            .join(','));
        return [header, ...rows].join('\n');
    }
    async buildPdf(report) {
        const doc = new pdfkit_1.default({ margin: 48 });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.fontSize(18).text('BioHax Lab Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Upload ID: ${report.upload.id}`);
        doc.text(`Generated: ${report.generatedAt}`);
        if (report.plan) {
            doc.text(`Linked Plan: ${report.plan.title ?? report.plan.id}`);
        }
        doc.moveDown();
        doc.fontSize(14).text('Biomarker Summary');
        doc.moveDown(0.5);
        report.measurements.forEach((measurement) => {
            doc
                .fontSize(11)
                .text(`${measurement.markerName}: ${measurement.value ?? '—'} ${measurement.unit ?? ''} ` +
                `(Δ ${measurement.deltaPercentage ?? 0}%)`);
        });
        doc.moveDown();
        doc.fontSize(14).text('Best Practices');
        doc.moveDown(0.5);
        if (report.bestPractices.length === 0) {
            doc.fontSize(11).text('No best-practice heuristics triggered yet.');
        }
        else {
            report.bestPractices.forEach((note, index) => {
                doc.fontSize(11).text(`${index + 1}. ${note}`);
            });
        }
        doc.end();
        return await new Promise((resolve) => {
            doc.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
        });
    }
    deriveBestPractices(measurements, plan) {
        const notes = [];
        const planLabel = plan?.title ?? 'current protocol';
        measurements.forEach((measurement) => {
            if (measurement.deltaPercentage === null) {
                return;
            }
            if (measurement.deltaPercentage <= -5) {
                notes.push(`${measurement.markerName} improved by ${Math.abs(measurement.deltaPercentage)}% since the last draw. Continue ${planLabel} and reinforce sleep + recovery blocks.`);
            }
            else if (measurement.deltaPercentage >= 5) {
                notes.push(`${measurement.markerName} climbed ${measurement.deltaPercentage}%. Revisit nutrition adherence inside ${planLabel} or escalate practitioner review.`);
            }
        });
        return notes;
    }
}
exports.LabReportService = LabReportService;
exports.labReportService = new LabReportService();
