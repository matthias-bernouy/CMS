import { ANALYTICS_VERSIONS } from "../../interfaces/AnalyticsPrivacy";

export const AUTOMATION_FILTER_VERSION = ANALYTICS_VERSIONS.filter;

const AUTOMATION_SIGNATURES = [
    /bot|crawl|crawler|spider|slurp|scanner/i,
    /gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic-ai/i,
    /perplexitybot|cohere-ai|bytespider|ccbot|meta-externalagent|amazonbot|applebot-extended/i,
    /ahrefs|semrush|mj12bot|dotbot|petalbot/i,
    /curl|wget|python-requests|python-urllib|aiohttp|go-http-client|libwww-perl|httpie/i,
    /scrapy|postmanruntime|node-fetch|axios\/|playwright|puppeteer|headless/i,
    /externalhit|embedly|bingpreview|whatsapp|telegram|slackbot|discordbot/i,
    /ia_archiver|lighthouse|pingdom|uptimerobot|synthetic/i,
] as const;

export function isAutomationUserAgent(userAgent: string): boolean {
    return AUTOMATION_SIGNATURES.some((signature) => signature.test(userAgent));
}

export function isPlausibleBrowserUserAgent(userAgent: string): boolean {
    return /mozilla\/5\.0|opera\//i.test(userAgent);
}
