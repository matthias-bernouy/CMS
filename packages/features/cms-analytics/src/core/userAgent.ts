/**
 * Minimal, dependency-free User-Agent classification: device family + browser, plus
 * bot detection. Pure. Deliberately coarse (no UA library) — good enough for the
 * device/browser breakdowns. Bots are flagged so callers can exclude them from counters.
 */

import type { AnalyticsEvent } from "../interfaces/AnalyticsEvent";

export type UserAgentClass = {
    device: AnalyticsEvent["device"];
    browser: string;
};

const BOT_RE =
    /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|bingpreview|whatsapp|telegram|ia_archiver|lighthouse|headless|pingdom|uptimerobot/i;
const TABLET_RE = /ipad|tablet|kindle|playbook|silk/i;
const MOBILE_RE = /mobi|iphone|ipod|android|blackberry|iemobile|opera mini/i;

/** Classify a raw User-Agent string into { device, browser }. PURE. */
export function classifyUserAgent(ua: string | undefined): UserAgentClass {
    const s = (ua ?? "").toLowerCase();
    if (!s) {
        return { device: "other", browser: "other" };
    }
    if (BOT_RE.test(s)) {
        return { device: "bot", browser: detectBrowser(s) };
    }
    const device = TABLET_RE.test(s) ? "tablet" : MOBILE_RE.test(s) ? "mobile" : "desktop";
    return { device, browser: detectBrowser(s) };
}

/** Coarse browser family from a lowercased UA. Order matters (edge/opera before chrome). PURE. */
function detectBrowser(s: string): string {
    if (s.includes("edg")) {
        return "edge";
    }
    if (s.includes("opr") || s.includes("opera")) {
        return "opera";
    }
    if (s.includes("firefox") || s.includes("fxios")) {
        return "firefox";
    }
    if (s.includes("chrome") || s.includes("crios") || s.includes("chromium")) {
        return "chrome";
    }
    if (s.includes("safari")) {
        return "safari";
    }
    return "other";
}
