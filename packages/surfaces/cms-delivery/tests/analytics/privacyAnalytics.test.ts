import { describe, expect, test } from "bun:test";
import { evaluateAnalyticsCompliance, InMemoryAnalyticsStore } from "@bernouy/cms-analytics";
import {
    analyticsPreferencePost,
    analyticsPrivacyPage,
    analyticsSelfAssessment,
} from "cms-delivery/core/analytics/privacyAnalyticsEndpoints";
import {
    analyticsOptOutCookieName,
    analyticsPreferenceCookie,
    isAnalyticsCollectionAllowed,
} from "cms-delivery/core/analytics/privacyPreference";

const delivery = {
    analytics: {
        getSettings: async () => ({
            enabled: true,
            visitorEstimation: true,
            rollupRetentionDays: 395,
            privacyNoticeUrl: "",
        }),
        latestPublishedComplianceSnapshot: async () => null,
    },
    analyticsVisitorSecret: "shared-secret",
    analyticsSiteScope: "https://example.test",
    analyticsTrustProxy: false,
    analyticsTrustedProxyVerified: false,
    analyticsCmsVersion: "development",
    analyticsHonorDnt: true,
    analyticsPrivacyPolicyUrl: "https://example.test/privacy",
    basePath: "",
} as never;

describe("analytics privacy preference", () => {
    test("uses a site-scoped boolean cookie with strict attributes", () => {
        const name = analyticsOptOutCookieName("https://example.test");
        expect(name).toMatch(/^p9r_analytics_opt_out_[0-9a-f]{8}$/);
        expect(analyticsPreferenceCookie(name, true, "/", true)).toContain(
            `${name}=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=`,
        );
        expect(analyticsPreferenceCookie(name, true, "/", true)).toEndWith("; Secure");
        expect(analyticsPreferenceCookie(name, false, "/", false)).toContain("Max-Age=0");
    });

    test("checks opt-out, GPC, and optional DNT before collection", () => {
        const name = analyticsOptOutCookieName("https://example.test");
        expect(
            isAnalyticsCollectionAllowed(
                new Request("https://example.test/", { headers: { cookie: `${name}=1` } }),
                name,
                true,
            ),
        ).toBe(false);
        expect(
            isAnalyticsCollectionAllowed(
                new Request("https://example.test/", { headers: { "sec-gpc": "1" } }),
                name,
                false,
            ),
        ).toBe(false);
        expect(
            isAnalyticsCollectionAllowed(new Request("https://example.test/", { headers: { dnt: "1" } }), name, true),
        ).toBe(false);
    });
});

describe("public analytics privacy endpoints", () => {
    test("registers privacy routes before the page wildcard", async () => {
        const source = await Bun.file(new URL("../../src/registerDeliveryEndpoints.ts", import.meta.url)).text();
        expect(source.indexOf('runner.addEndpoint("GET", PRIVACY_ANALYTICS_ROUTES.page')).toBeGreaterThan(-1);
        expect(source.indexOf('runner.addEndpoint("GET", PRIVACY_ANALYTICS_ROUTES.page')).toBeLessThan(
            source.indexOf('runner.setDefaultEndpoint("GET"'),
        );
    });

    test("GET is non-mutating, no-store HTML with an accessible form", async () => {
        const response = await analyticsPrivacyPage(
            new Request("https://example.test/.cms/privacy/analytics"),
            delivery,
        );
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("vary")).toBe("Cookie");
        expect(response.headers.get("referrer-policy")).toBe("no-referrer");
        expect(response.headers.has("set-cookie")).toBe(false);
        expect(await response.text()).toContain('method="post"');
    });

    test("POST validates the public origin and sets or clears the preference", () => {
        const invalid = analyticsPreferencePost(
            new Request("https://example.test/.cms/privacy/analytics/opt-out", {
                method: "POST",
                headers: { origin: "https://attacker.test" },
            }),
            delivery,
            true,
        );
        expect(invalid.status).toBe(403);
        const valid = analyticsPreferencePost(
            new Request("https://example.test/.cms/privacy/analytics/opt-out", {
                method: "POST",
                headers: { origin: "https://example.test" },
            }),
            delivery,
            true,
        );
        expect(valid.status).toBe(303);
        expect(valid.headers.get("set-cookie")).toContain("=1;");
        expect(valid.headers.get("set-cookie")).toContain("Secure");
    });

    test("exposes only an explicitly published, sanitized self-assessment", async () => {
        const analytics = new InMemoryAnalyticsStore();
        const context = {
            cmsVersion: "development",
            secretReady: true,
            siteScope: "https://example.test",
            trustProxy: false,
            trustedProxyVerified: false,
            secureCookie: true,
            optOutUrl: "https://example.test/.cms/privacy/analytics",
        };
        const evaluatedAt = new Date("2026-07-23T12:00:00Z");
        await analytics.saveComplianceSnapshot({
            id: "published",
            createdAt: evaluatedAt,
            publishedAt: evaluatedAt,
            evaluation: await evaluateAnalyticsCompliance(await analytics.getSettings(), context, {}, evaluatedAt),
            manualAttestations: {},
        });
        const response = await analyticsSelfAssessment(
            new Request("https://example.test/.cms/privacy/analytics/self-assessment"),
            { ...delivery, analytics } as never,
        );
        const body = await response.json();
        expect(body).toMatchObject({
            status: "incomplete",
            checklistVersion: "cnil-audience-measurement-2026-01",
            releaseReady: false,
            stale: false,
        });
        expect(JSON.stringify(body)).not.toContain("shared-secret");
        expect(JSON.stringify(body)).not.toContain("evidence");
    });
});
