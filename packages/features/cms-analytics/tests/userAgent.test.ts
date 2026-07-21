import { describe, test, expect } from "bun:test";
import { classifyUserAgent } from "cms-analytics/core/userAgent";

const CHROME_DESKTOP =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const SAFARI_IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const SAFARI_IPAD =
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0";
const EDGE =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

describe("classifyUserAgent — device", () => {
    test("desktop", () => expect(classifyUserAgent(CHROME_DESKTOP).device).toBe("desktop"));
    test("mobile (iPhone)", () => expect(classifyUserAgent(SAFARI_IPHONE).device).toBe("mobile"));
    test("tablet (iPad)", () => expect(classifyUserAgent(SAFARI_IPAD).device).toBe("tablet"));
    test("bot (Googlebot)", () => expect(classifyUserAgent(GOOGLEBOT).device).toBe("bot"));
    test("empty/undefined → other", () => {
        expect(classifyUserAgent("").device).toBe("other");
        expect(classifyUserAgent(undefined).device).toBe("other");
    });
});

describe("classifyUserAgent — browser", () => {
    test("chrome", () => expect(classifyUserAgent(CHROME_DESKTOP).browser).toBe("chrome"));
    test("safari (not misread as chrome)", () => expect(classifyUserAgent(SAFARI_IPHONE).browser).toBe("safari"));
    test("firefox", () => expect(classifyUserAgent(FIREFOX).browser).toBe("firefox"));
    test("edge (not misread as chrome)", () => expect(classifyUserAgent(EDGE).browser).toBe("edge"));
});
