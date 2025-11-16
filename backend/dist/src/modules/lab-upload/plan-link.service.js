"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.labPlanLinkService = exports.LabPlanLinkService = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const FOCUS_MAP = {
    glucose: ['metabolic'],
    hba1c: ['metabolic'],
    insulin: ['metabolic'],
    triglycerides: ['cardiovascular'],
    cholesterol: ['cardiovascular'],
    ldl: ['cardiovascular'],
    hdl: ['cardiovascular'],
    apob: ['cardiovascular'],
    crp: ['inflammation'],
    homocysteine: ['inflammation'],
    testosterone: ['hormonal'],
    progesterone: ['hormonal'],
    cortisol: ['stress'],
    vitaminD: ['hormonal'],
    ferritin: ['recovery']
};
const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
class LabPlanLinkService {
    constructor(prisma = prisma_1.default) {
        this.prisma = prisma;
    }
    async autoLink(uploadId, userId, measurements) {
        const focusScores = this.deriveFocusScores(measurements);
        if (focusScores.size === 0) {
            return;
        }
        const plans = await this.prisma.longevityPlan.findMany({
            where: {
                userId,
                status: {
                    in: ['READY', 'PROCESSING', 'DRAFT']
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        if (plans.length === 0) {
            return;
        }
        const ranked = this.rankPlans(plans, focusScores);
        const best = ranked[0];
        if (!best || best.score === 0) {
            return;
        }
        await this.prisma.panelUpload.update({
            where: { id: uploadId },
            data: { planId: best.plan.id }
        });
        const note = {
            type: 'LAB_UPLOAD',
            uploadId,
            biomarkers: measurements.slice(0, 10).map((measurement) => measurement.markerName),
            matchedFocusAreas: best.matchedAreas,
            createdAt: new Date().toISOString()
        };
        const existingEvidence = Array.isArray(best.plan.evidence) ? best.plan.evidence : [];
        const updatedEvidence = [...existingEvidence];
        updatedEvidence.push(note);
        while (updatedEvidence.length > 25) {
            updatedEvidence.shift();
        }
        const toJsonValue = (value) => JSON.parse(JSON.stringify(value));
        await this.prisma.longevityPlan.update({
            where: { id: best.plan.id },
            data: {
                evidence: toJsonValue(updatedEvidence)
            }
        });
    }
    deriveFocusScores(measurements) {
        const scores = new Map();
        measurements.forEach((measurement) => {
            const normalized = normalize(measurement.markerName);
            const focusAreas = FOCUS_MAP[normalized];
            if (!focusAreas) {
                return;
            }
            focusAreas.forEach((focus) => {
                scores.set(focus, (scores.get(focus) ?? 0) + 1);
            });
        });
        return scores;
    }
    rankPlans(plans, focusScores) {
        return plans
            .map((plan) => {
            const matches = (plan.focusAreas ?? []).filter((area) => focusScores.has(area));
            const score = matches.reduce((acc, area) => acc + (focusScores.get(area) ?? 0), 0);
            return { plan, score, matchedAreas: matches };
        })
            .sort((a, b) => b.score - a.score);
    }
}
exports.LabPlanLinkService = LabPlanLinkService;
exports.labPlanLinkService = new LabPlanLinkService();
