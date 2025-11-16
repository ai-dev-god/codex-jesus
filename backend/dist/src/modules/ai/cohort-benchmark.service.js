"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cohortBenchmarkService = exports.CohortBenchmarkService = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const BENCHMARKS = [
    { marker: 'glucose', displayName: 'Fasting Glucose', direction: 'lower', unit: 'mg/dL' },
    { marker: 'apob', displayName: 'ApoB', direction: 'lower', unit: 'mg/dL' },
    { marker: 'crp', displayName: 'CRP', direction: 'lower', unit: 'mg/L' },
    { marker: 'hrv', displayName: 'HRV', direction: 'higher', unit: 'ms' }
];
const toNumber = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
};
class CohortBenchmarkService {
    constructor(prisma = prisma_1.default) {
        this.prisma = prisma;
    }
    async compute(userId) {
        const markers = BENCHMARKS.map((item) => item.marker.toLowerCase());
        const userMeasurements = await this.prisma.biomarkerMeasurement.findMany({
            where: {
                userId,
                markerName: { in: markers }
            },
            orderBy: { capturedAt: 'desc' }
        });
        const latestByMarker = new Map();
        userMeasurements.forEach((measurement) => {
            const key = measurement.markerName.toLowerCase();
            if (!latestByMarker.has(key)) {
                const numericValue = toNumber(measurement.value);
                if (numericValue !== null) {
                    latestByMarker.set(key, numericValue);
                }
            }
        });
        const cohorts = await this.prisma.biomarkerMeasurement.groupBy({
            by: ['markerName'],
            where: { markerName: { in: markers } },
            _avg: { value: true },
            _count: { _all: true }
        });
        const cohortMap = new Map(cohorts.map((entry) => [
            entry.markerName.toLowerCase(),
            { average: toNumber(entry._avg.value), count: entry._count._all }
        ]));
        return BENCHMARKS.map((definition) => {
            const userValue = latestByMarker.get(definition.marker) ?? null;
            const cohortStats = cohortMap.get(definition.marker);
            const percentile = userValue !== null && typeof cohortStats?.average === 'number'
                ? this.computePercentile(userValue, cohortStats.average, definition.direction)
                : null;
            return {
                markerName: definition.marker,
                displayName: definition.displayName,
                userValue,
                cohortAverage: cohortStats?.average ?? null,
                cohortSampleSize: cohortStats?.count ?? 0,
                percentile,
                unit: definition.unit ?? null
            };
        });
    }
    computePercentile(userValue, cohortAverage, direction) {
        if (direction === 'lower') {
            return Math.max(1, Math.min(99, Math.round((cohortAverage / userValue) * 50)));
        }
        return Math.max(1, Math.min(99, Math.round((userValue / cohortAverage) * 50)));
    }
}
exports.CohortBenchmarkService = CohortBenchmarkService;
exports.cohortBenchmarkService = new CohortBenchmarkService();
