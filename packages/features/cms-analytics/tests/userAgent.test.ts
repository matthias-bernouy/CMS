import { describe, expect, test } from "bun:test";
import { classifyUserAgent } from "cms-analytics/core/collection/userAgent";

const CHROME =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1";

describe("classifyUserAgent", () => {
    test("keeps only coarse device and browser families for human agents", () => {
        expect(classifyUserAgent(CHROME)).toEqual({ device: "desktop", browser: "chrome" });
        expect(classifyUserAgent(IPHONE)).toEqual({ device: "mobile", browser: "safari" });
    });

    test("marks bots, AI/SEO crawlers, HTTP clients, and headless browsers as automation", () => {
        for (const userAgent of [
            "Googlebot/2.1",
            "GPTBot/1.2",
            "ClaudeBot/1.0",
            "AhrefsBot/7.0",
            "SemrushBot/7",
            "curl/8.8",
            "Wget/1.21",
            "python-requests/2.32",
            "Go-http-client/2.0",
            "Scrapy/2.11",
            "HeadlessChrome/120",
        ]) {
            expect(classifyUserAgent(userAgent).exclusionReason).toBe("automation");
        }
    });

    test("fails closed for an empty user agent", () => {
        expect(classifyUserAgent(undefined)).toEqual({
            device: "other",
            browser: "other",
            exclusionReason: "invalid_user_agent",
        });
    });
});
