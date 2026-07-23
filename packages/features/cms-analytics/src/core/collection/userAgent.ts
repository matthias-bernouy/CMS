/**
 * Minimal, dependency-free User-Agent classification: device family + browser, plus
 * bot detection. Pure. Deliberately coarse (no UA library) — good enough for the
 * device/browser breakdowns. Bots are flagged so callers can exclude them from counters.
 */

import type { AnalyticsEvent, AnalyticsExclusionReason } from "../../interfaces/AnalyticsEvent";

export type UserAgentClass = {
    device: AnalyticsEvent["device"];
    browser: AnalyticsEvent["browser"];
    exclusionReason?: AnalyticsExclusionReason;
};

const BOT_RE =
    /bot|crawl|spider|slurp|mediapartners|externalhit|embedly|bingpreview|whatsapp|telegram|ia_archiver|lighthouse|headless|pingdom|uptimerobot|crawler|scanner|scrapy/i;
const AUTOMATION_RE =
    /curl|wget|python-requests|python-urllib|go-http-client|libwww-perl|httpie|postmanruntime|node-fetch|axios\//i;
const KNOWN_CRAWLER_RE =
    /gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic-ai|perplexitybot|cohere-ai|bytespider|ccbot|meta-externalagent|amazonbot|applebot-extended|ahrefs|semrush|mj12bot|dotbot|petalbot/i;
const TABLET_RE = /ipad|tablet|kindle|playbook|silk/i;
const MOBILE_RE = /mobi|iphone|ipod|android|blackberry|iemobile|opera mini/i;

/** Classify a raw User-Agent string into { device, browser }. PURE. */
export function classifyUserAgent(ua: string | undefined): UserAgentClass {
    const s = (ua ?? "").toLowerCase();
    if (!s) {
        return { device: "other", browser: "other", exclusionReason: "invalid_user_agent" };
    }
    if (BOT_RE.test(s) || AUTOMATION_RE.test(s) || KNOWN_CRAWLER_RE.test(s)) {
        return { device: "other", browser: detectBrowser(s), exclusionReason: "automation" };
    }
    const device = TABLET_RE.test(s) ? "tablet" : MOBILE_RE.test(s) ? "mobile" : "desktop";
    return { device, browser: detectBrowser(s) };
}

/** Coarse browser family from a lowercased UA. Order matters (edge/opera before chrome). PURE. */
function detectBrowser(s: string): AnalyticsEvent["browser"] {
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
