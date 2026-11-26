export const CONSENT_STORAGE_KEY = 'portal-edital-cookie-consent';

export const CONSENT_VALUES = Object.freeze({
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
});

const USERWAY_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const CLARITY_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const GA_ID_PATTERN = /^G-[A-Za-z0-9]{4,32}$/;

function sanitizeId(rawValue, pattern) {
    if (typeof rawValue !== 'string') return null;
    const trimmed = rawValue.trim();
    if (!trimmed || !pattern.test(trimmed)) return null;
    return trimmed;
}

export function getPluginConfig(env = {}) {
    const userwayId = sanitizeId(env.PUBLIC_USERWAY_ACCOUNT_ID, USERWAY_ID_PATTERN);
    const clarityId = sanitizeId(env.PUBLIC_CLARITY_PROJECT_ID, CLARITY_ID_PATTERN);
    const gaId = sanitizeId(env.PUBLIC_GA_MEASUREMENT_ID, GA_ID_PATTERN);

    return {
        userwayId,
        clarityId,
        gaId,
        hasTelemetry: Boolean(clarityId || gaId),
    };
}

export function shouldLoadTelemetry(consentValue, config) {
    return Boolean(config?.hasTelemetry && consentValue === CONSENT_VALUES.ACCEPTED);
}

export function shouldShowConsentBanner(consentValue, config) {
    if (!config?.hasTelemetry) return false;
    return (
        consentValue !== CONSENT_VALUES.ACCEPTED &&
        consentValue !== CONSENT_VALUES.REJECTED
    );
}
