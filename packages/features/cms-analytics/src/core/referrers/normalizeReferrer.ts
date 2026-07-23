import { getDomain } from "tldts";

export function normalizeExternalReferrer(
    rawReferrer: string | null,
    requestUrl: URL,
    requestHost: string | null,
): string | undefined {
    if (!rawReferrer) {
        return;
    }
    try {
        const referrer = new URL(rawReferrer);
        if (referrer.protocol !== "http:" && referrer.protocol !== "https:") {
            return;
        }
        const currentHostname = normalizedHostname(requestHost) ?? requestUrl.hostname.toLowerCase();
        const referrerHostname = referrer.hostname.toLowerCase();
        const currentDomain = registrableDomain(currentHostname);
        const referrerDomain = registrableDomain(referrerHostname);
        if (!referrerDomain || referrerHostname === currentHostname || referrerDomain === currentDomain) {
            return;
        }
        return referrerDomain;
    } catch {
        return;
    }
}

function registrableDomain(hostname: string): string | undefined {
    return getDomain(hostname, { allowPrivateDomains: true })?.toLowerCase();
}

export function isNormalizedRegistrableDomain(value: string): boolean {
    return value === value.toLowerCase() && registrableDomain(value) === value;
}

function normalizedHostname(host: string | null): string | undefined {
    if (!host) {
        return;
    }
    try {
        return new URL(`http://${host}`).hostname.toLowerCase();
    } catch {
        return;
    }
}
