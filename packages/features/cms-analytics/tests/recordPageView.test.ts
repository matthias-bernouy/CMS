import { describe, expect, test } from "bun:test";
import { buildPageViewEvent } from "@bernouy/cms-analytics";

const CHROME =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const req = (headers: Record<string, string> = {}, path = "/about?utm_campaign=discarded") =>
    new Request(`http://cms:3000${path}`, { headers });
const options = { pageId: "page-about", siteScope: "site-a", now: new Date("2026-06-02T12:00:00Z") };

describe("buildPageViewEvent", () => {
    test("emits only stable content identity and an ephemeral daily HMAC", async () => {
        const event = await buildPageViewEvent(
            req({ "user-agent": CHROME, "x-forwarded-for": "192.0.2.42" }),
            200,
            12,
            "secret",
            { ...options, trustProxy: true },
        );
        expect(event).toMatchObject({
            type: "delivery_request",
            pageId: "page-about",
            status: 200,
            durationMs: 12,
            entry: true,
            device: "desktop",
            browser: "chrome",
        });
        expect(event.visitorHash).toMatch(/^[0-9a-f]{64}$/);
        expect(event).not.toHaveProperty("path");
        expect(event).not.toHaveProperty("visitorId");
        expect(JSON.stringify(event)).not.toContain("utm_campaign");
    });

    test("does not create a visitor hash for unresolved, failed, or automated requests", async () => {
        const unresolved = await buildPageViewEvent(req({ "user-agent": CHROME }), 200, 1, "secret", {
            siteScope: "site-a",
        });
        const failed = await buildPageViewEvent(req({ "user-agent": CHROME }), 404, 1, "secret", options);
        const automated = await buildPageViewEvent(req({ "user-agent": "curl/8.8" }), 200, 1, "secret", options);
        expect(unresolved.visitorHash).toBeUndefined();
        expect(failed.visitorHash).toBeUndefined();
        expect(automated.exclusionReason).toBe("automation");
        expect(automated.visitorHash).toBeUndefined();
    });

    test("trusts forwarding headers only when explicitly configured", async () => {
        const headers = { "user-agent": CHROME, "x-forwarded-for": "192.0.2.42" };
        const trusted = await buildPageViewEvent(req(headers), 200, 1, "secret", { ...options, trustProxy: true });
        const spoofed = await buildPageViewEvent(req(headers), 200, 1, "secret", options);
        expect(trusted.visitorHash).not.toBe(spoofed.visitorHash);
    });

    test("keeps an external hostname but discards its URL and all same-site referrer data", async () => {
        const external = await buildPageViewEvent(
            req({ "user-agent": CHROME, host: "example.com", referer: "https://news.example/story?q=secret" }),
            200,
            1,
            "secret",
            options,
        );
        const internal = await buildPageViewEvent(
            req({ "user-agent": CHROME, host: "example.com", referer: "https://example.com/private/path?q=secret" }),
            200,
            1,
            "secret",
            { ...options, previousPageId: "page-home" },
        );
        expect(external.referrerDomain).toBe("news.example");
        expect(JSON.stringify(external)).not.toContain("secret");
        expect(internal).toMatchObject({ previousPageId: "page-home", entry: false });
        expect(internal.referrerDomain).toBeUndefined();
    });

    test("classifies prefetch, prerender, system routes, and empty user agents", async () => {
        const prefetch = await buildPageViewEvent(
            req({ "user-agent": CHROME, purpose: "prefetch" }),
            200,
            1,
            "secret",
            options,
        );
        const prerender = await buildPageViewEvent(
            req({ "user-agent": CHROME, "sec-purpose": "prefetch;prerender" }),
            200,
            1,
            "secret",
            options,
        );
        const system = await buildPageViewEvent(req({ "user-agent": CHROME }, "/.cms/privacy/analytics"), 200, 1, "", {
            siteScope: "",
        });
        const empty = await buildPageViewEvent(req(), 200, 1, "secret", options);
        expect(prefetch.exclusionReason).toBe("prefetch");
        expect(prerender.exclusionReason).toBe("prerender");
        expect(system.exclusionReason).toBe("system_route");
        expect(empty.exclusionReason).toBe("invalid_user_agent");
    });
});
