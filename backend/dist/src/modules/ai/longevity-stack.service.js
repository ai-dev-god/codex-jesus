"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.longevityStackService = exports.LongevityStackService = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const STACK_DEFINITIONS = [
    {
        id: 'metabolic',
        title: 'Metabolic Stack',
        focusArea: 'metabolic',
        supplements: ['Berberine', 'ALA', 'Magnesium Glycinate', 'Cinnamon'],
        description: 'Stabilize glucose variability and improve insulin sensitivity.',
        biomarkers: ['glucose', 'hba1c', 'insulin']
    },
    {
        id: 'cardiovascular',
        title: 'Cardiovascular Stack',
        focusArea: 'cardiovascular',
        supplements: ['Omega-3 EPA/DHA', 'Citrus Bergamot', 'Niacin'],
        description: 'Reduce ApoB/LDL particle load and support endothelial health.',
        biomarkers: ['apob', 'ldl', 'triglycerides', 'hdl']
    },
    {
        id: 'inflammation',
        title: 'Inflammation Stack',
        focusArea: 'inflammation',
        supplements: ['Curcumin', 'Boswellia', 'Astaxanthin'],
        description: 'Lower chronic inflammation and improve recovery capacity.',
        biomarkers: ['crp', 'homocysteine', 'il6']
    },
    {
        id: 'hormonal',
        title: 'Hormonal Stack',
        focusArea: 'hormonal',
        supplements: ['Ashwagandha', 'Vitamin D3/K2', 'Zinc'],
        description: 'Balance cortisol and sex hormones for better resilience.',
        biomarkers: ['cortisol', 'testosterone', 'progesterone']
    }
];
const toNumber = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
};
class LongevityStackService {
    constructor(prisma = prisma_1.default) {
        this.prisma = prisma;
    }
    async computeStacks(userId) {
        const measurements = await this.prisma.biomarkerMeasurement.findMany({
            where: { userId },
            orderBy: { capturedAt: 'desc' },
            take: 250
        });
        const latestByMarker = new Map();
        const previousByMarker = new Map();
        measurements.forEach((measurement) => {
            const key = measurement.markerName.toLowerCase();
            if (!latestByMarker.has(key)) {
                latestByMarker.set(key, measurement);
            }
            else if (!previousByMarker.has(key) && measurement.panelUploadId !== latestByMarker.get(key)?.panelUploadId) {
                previousByMarker.set(key, measurement);
            }
        });
        const stacks = STACK_DEFINITIONS.map((definition) => {
            const keyBiomarkers = definition.biomarkers
                .map((marker) => {
                const latest = latestByMarker.get(marker);
                const previous = previousByMarker.get(marker);
                const latestValue = latest ? toNumber(latest.value) : null;
                const previousValue = previous ? toNumber(previous.value) : null;
                const delta = latestValue !== null && previousValue !== null && previousValue !== 0
                    ? Number((((latestValue - previousValue) / Math.abs(previousValue)) * 100).toFixed(2))
                    : null;
                return {
                    markerName: latest?.markerName ?? marker,
                    deltaPercentage: delta
                };
            })
                .filter((entry) => entry.markerName !== undefined);
            const validDeltas = keyBiomarkers.map((entry) => entry.deltaPercentage).filter((value) => value !== null);
            const impactDelta = validDeltas.length > 0
                ? Number((validDeltas.reduce((sum, value) => sum + value, 0) / validDeltas.length).toFixed(2))
                : null;
            const improvements = validDeltas.filter((value) => value < 0).length;
            const regressions = validDeltas.filter((value) => value > 0).length;
            const adherenceScore = Math.max(35, Math.min(100, 60 + improvements * 8 - regressions * 5));
            const narrative = validDeltas.length === 0
                ? `${definition.title} needs new data — upload a fresh panel to benchmark progress.`
                : impactDelta !== null && impactDelta < 0
                    ? `${definition.title} improved biomarkers by ${Math.abs(impactDelta)}%. Maintain the current stack for another 4 weeks.`
                    : `${definition.title} drifted ${impactDelta ?? 0}% upward. Tighten adherence and review protocols.`;
            return {
                id: definition.id,
                title: definition.title,
                focusArea: definition.focusArea,
                adherenceScore,
                impactDelta,
                keyBiomarkers,
                recommendedSupplements: definition.supplements,
                narrative
            };
        });
        return stacks;
    }
}
exports.LongevityStackService = LongevityStackService;
exports.longevityStackService = new LongevityStackService();
