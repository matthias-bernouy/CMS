import { describe, test, expect } from "bun:test";
import { buildPageViewEvent } from "@bernouy/cms-analytics";

const CHROME =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const req = (headers: Record<string, string>) => new Request("http://cms:3000/about?x=1", { headers });

describe("buildPageViewEvent", () => {
    test("assembles path (query stripped), status, duration, device/browser, hashed visitorId", async () => {
        const e = await buildPageViewEvent(
            req({ "user-agent": CHROME, "x-forwarded-for": "1.2.3.4" }),
            200,
            12,
            "secret",
        );
        expect(e.type).toBe("pageview");
        expect(e.path).toBe("/about");
        expect(e.status).toBe(200);
        expect(e.durationMs).toBe(12);
        expect(e.device).toBe("desktop");
        expect(e.browser).toBe("chrome");
        expect(e.visitorId).toMatch(/^[0-9a-f]{64}$/);
        expect(e.referrerHost).toBeUndefined();
        expect(e.fromPath).toBeUndefined();
    });

    test("external referer → referrerHost, no fromPath", async () => {
        const e = await buildPageViewEvent(
            req({ "user-agent": CHROME, host: "example.com", referer: "https://google.com/search?q=x" }),
            200,
            5,
            "s",
        );
        expect(e.referrerHost).toBe("google.com");
        expect(e.fromPath).toBeUndefined();
    });

    test("same-origin referer (Host header) → fromPath, no referrerHost", async () => {
        const e = await buildPageViewEvent(
            req({ "user-agent": CHROME, host: "example.com", referer: "https://example.com/home" }),
            200,
            5,
            "s",
        );
        expect(e.fromPath).toBe("/home");
        expect(e.referrerHost).toBeUndefined();
    });

    test("visitorId stable for same ip/ua/secret (first XFF hop), varies by ip", async () => {
        const h = { "user-agent": CHROME, "x-forwarded-for": "1.2.3.4, 10.0.0.1" };
        const a = await buildPageViewEvent(req(h), 200, 1, "s");
        const b = await buildPageViewEvent(req(h), 200, 1, "s");
        expect(a.visitorId).toBe(b.visitorId);
        const c = await buildPageViewEvent(req({ "user-agent": CHROME, "x-forwarded-for": "9.9.9.9" }), 200, 1, "s");
        expect(c.visitorId).not.toBe(a.visitorId);
    });

    test("can ignore spoofable forwarding headers outside a trusted proxy", async () => {
        const a = await buildPageViewEvent(req({ "user-agent": CHROME, "x-forwarded-for": "1.2.3.4" }), 200, 1, "s", {
            trustProxy: false,
        });
        const b = await buildPageViewEvent(req({ "user-agent": CHROME, "x-forwarded-for": "9.9.9.9" }), 200, 1, "s", {
            trustProxy: false,
        });
        expect(a.visitorId).toBe(b.visitorId);
    });

    test("accepts a stable page id supplied after content resolution", async () => {
        const event = await buildPageViewEvent(req({ "user-agent": CHROME }), 200, 1, "s", {
            pageId: "page-about",
        });
        expect(event.pageId).toBe("page-about");
    });

    test("rejects an empty visitor secret", async () => {
        await expect(buildPageViewEvent(req({ "user-agent": CHROME }), 200, 1, "")).rejects.toThrow(
            "analytics visitor secret is required",
        );
    });

    test("malformed referer is ignored", async () => {
        const e = await buildPageViewEvent(req({ "user-agent": CHROME, referer: "not a url" }), 200, 1, "s");
        expect(e.referrerHost).toBeUndefined();
        expect(e.fromPath).toBeUndefined();
    });
});
