"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildNotificationEmail = void 0;
const normalizeName = (displayName) => displayName && displayName.trim().length > 0 ? displayName.trim() : 'there';
const renderInsightAlert = (payload) => {
    const memberName = normalizeName(payload.recipient.displayName);
    const summary = payload.data.summary ? `<p>${payload.data.summary}</p>` : '';
    return {
        subject: `New insight: ${payload.data.insightTitle}`,
        html: [
            `<p>Hi ${memberName},</p>`,
            `<p>Your latest BioHax insight <strong>${payload.data.insightTitle}</strong> just landed.</p>`,
            summary,
            '<p>Open your dashboard to review the full recommendation set and keep your streak alive.</p>',
            '<p>— BioHax Team</p>'
        ].join(''),
        text: [
            `Hi ${memberName},`,
            '',
            `Your latest BioHax insight "${payload.data.insightTitle}" just landed.`,
            payload.data.summary ? `\n${payload.data.summary}\n` : '',
            'Open your dashboard to review the full recommendation set and keep your streak alive.',
            '',
            '— BioHax Team'
        ].join('\n')
    };
};
const streakLabels = {
    INSIGHTS: 'insight',
    LOGGING: 'logging',
    COMMUNITY: 'community'
};
const renderStreakNudge = (payload) => {
    const memberName = normalizeName(payload.recipient.displayName);
    const label = streakLabels[payload.data.streakType] ?? 'daily';
    return {
        subject: `Keep your ${label} streak going!`,
        html: [
            `<p>Hi ${memberName},</p>`,
            `<p>You're on a <strong>${payload.data.currentStreak}-day</strong> ${label} streak. One more action today keeps the momentum going.</p>`,
            '<p>Jump back in now to stay on track.</p>',
            '<p>— BioHax Team</p>'
        ].join(''),
        text: [
            `Hi ${memberName},`,
            '',
            `You're on a ${payload.data.currentStreak}-day ${label} streak. One more action today keeps the momentum going.`,
            '',
            'Jump back in now to stay on track.',
            '',
            '— BioHax Team'
        ].join('\n')
    };
};
const renderModerationNotice = (payload) => {
    const memberName = normalizeName(payload.recipient.displayName);
    const reason = payload.data.reason ? `<p>${payload.data.reason}</p>` : '';
    return {
        subject: 'Moderation update on your community activity',
        html: [
            `<p>Hi ${memberName},</p>`,
            `<p>We reviewed flag ${payload.data.flagId} and marked it as <strong>${payload.data.status}</strong>.</p>`,
            reason,
            '<p>Reach out in-app if something looks off.</p>',
            '<p>— BioHax Moderation</p>'
        ].join(''),
        text: [
            `Hi ${memberName},`,
            '',
            `We reviewed flag ${payload.data.flagId} and marked it as ${payload.data.status}.`,
            payload.data.reason ? `\n${payload.data.reason}\n` : '',
            'Reach out in-app if something looks off.',
            '',
            '— BioHax Moderation'
        ].join('\n')
    };
};
const renderOnboardingWelcome = (payload) => {
    const memberName = normalizeName(payload.recipient.displayName);
    const loginUrl = payload.data.loginUrl ?? 'https://app.biohax.local/login';
    const supportEmail = payload.data.supportEmail ?? 'support@biohax.local';
    return {
        subject: 'Welcome to BioHax!',
        html: [
            `<p>Hi ${memberName},</p>`,
            '<p>Welcome aboard! Your dashboard is ready whenever you are.</p>',
            `<p><a href="${loginUrl}">Sign in</a> to complete onboarding, or reply to this email for help.</p>`,
            `<p>If you get stuck, reach us at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>`,
            '<p>— BioHax Team</p>'
        ].join(''),
        text: [
            `Hi ${memberName},`,
            '',
            'Welcome aboard! Your dashboard is ready whenever you are.',
            `Sign in at ${loginUrl} to complete onboarding, or reply to this email for help.`,
            `If you get stuck, reach us at ${supportEmail}.`,
            '',
            '— BioHax Team'
        ].join('\n')
    };
};
const renderCommunityEvent = (payload) => {
    const memberName = normalizeName(payload.recipient.displayName);
    const ctaUrl = payload.data.ctaUrl ?? 'https://app.biohax.local/community';
    const startLine = payload.data.eventStartsAt
        ? `It kicks off on ${new Date(payload.data.eventStartsAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        })}.`
        : 'It kicks off soon.';
    return {
        subject: `${payload.data.eventName} kicks off soon!`,
        html: [
            `<p>Hi ${memberName},</p>`,
            `<p>${payload.data.eventName} is coming up. ${startLine}</p>`,
            `<p><a href="${ctaUrl}">Save your spot now</a> so you don't miss the opening.</p>`,
            '<p>— BioHax Community</p>'
        ].join(''),
        text: [
            `Hi ${memberName},`,
            '',
            `${payload.data.eventName} is coming up. ${startLine}`,
            `Save your spot now at ${ctaUrl} so you don't miss the opening.`,
            '',
            '— BioHax Community'
        ].join('\n')
    };
};
const builders = {
    INSIGHT_ALERT: renderInsightAlert,
    STREAK_NUDGE: renderStreakNudge,
    MODERATION_NOTICE: renderModerationNotice,
    ONBOARDING_WELCOME: renderOnboardingWelcome,
    COMMUNITY_EVENT: renderCommunityEvent
};
const buildNotificationEmail = (payload) => {
    const builder = builders[payload.type];
    const email = builder(payload);
    return {
        ...email,
        tags: [
            ...(email.tags ?? []),
            { name: 'notification-type', value: payload.type },
            { name: 'notification-channel', value: payload.channel }
        ]
    };
};
exports.buildNotificationEmail = buildNotificationEmail;
