import { describe, expect, test } from "bun:test";
import {
    analyticsComplianceHandler,
    createAnalyticsComplianceSnapshotHandler,
    evaluateAnalyticsCompliance,
    InMemoryAnalyticsStore,
    updateAnalyticsSettingsHandler,
} from "@bernouy/cms-analytics";
import type { AnalyticsComplianceContext, AnalyticsEvent } from "@bernouy/cms-analytics";

const context: AnalyticsComplianceContext = {
    cmsVersion: "0.1.0",
    secretReady: true,
    siteScope: "https://example.test",
    trustProxy: false,
    trustedProxyVerified: false,
    secureCookie: true,
    optOutUrl: "https://example.test/.cms/privacy/analytics",
};

describe("analytics governance", () => {
    test("separates automatic checks from evidenced site-level attestations", async () => {
        const store = new InMemoryAnalyticsStore();
        const initial = await evaluateAnalyticsCompliance(await store.getSettings(), context);
        expect(initial.releaseReady).toBe(false);
        expect(initial.criteria.find((item) => item.id === "no_raw_events")).toMatchObject({
            mode: "automatic",
            status: "pass",
        });

        const manual = Object.fromEntries(
            initial.criteria
                .filter((item) => item.mode === "manual")
                .map((item) => [item.id, { status: "pass" as const, evidence: `Reviewed: ${item.id}` }]),
        );
        const complete = await evaluateAnalyticsCompliance(await store.getSettings(), context, manual);
        expect(complete.releaseReady).toBe(true);
        expect(JSON.stringify(complete)).not.toContain("shared-secret");
    });

    test("validates settings and makes disabling collection effective", async () => {
        const store = new InMemoryAnalyticsStore();
        const response = await updateAnalyticsSettingsHandler(
            store,
            jsonRequest({
                enabled: false,
                visitorEstimation: false,
                rollupRetentionDays: 30,
                privacyNoticeUrl: "https://example.test/privacy",
            }),
        );
        expect(response.status).toBe(200);
        await store.record(event());
        expect((await store.summary(new Date("2026-07-01"), new Date("2026-08-01"))).views).toBe(0);

        const invalid = await updateAnalyticsSettingsHandler(
            store,
            jsonRequest({
                enabled: true,
                visitorEstimation: true,
                rollupRetentionDays: 396,
                privacyNoticeUrl: "",
            }),
        );
        expect(invalid.status).toBe(400);
    });

    test("publishes only explicit immutable snapshots and reports configuration drift", async () => {
        const store = new InMemoryAnalyticsStore();
        const evaluation = await evaluateAnalyticsCompliance(await store.getSettings(), context);
        const manualAttestations = Object.fromEntries(
            evaluation.criteria
                .filter((item) => item.mode === "manual")
                .map((item) => [item.id, { status: "pass" as const, evidence: "Documented" }]),
        );
        const created = await createAnalyticsComplianceSnapshotHandler(
            store,
            context,
            jsonRequest({ manualAttestations, publish: true }),
        );
        expect(created.status).toBe(201);

        const current = await analyticsComplianceHandler(store, context);
        expect(await current.json()).toMatchObject({
            evaluation: { releaseReady: true },
            latestPublished: { releaseReady: true, stale: false },
        });
        await store.updateSettings({ ...(await store.getSettings()), rollupRetentionDays: 30 });
        const stale = await analyticsComplianceHandler(store, context);
        expect(await stale.json()).toMatchObject({ latestPublished: { stale: true } });
    });
});

function jsonRequest(body: unknown): Request {
    return new Request("https://control.test/api/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function event(): AnalyticsEvent {
    return {
        type: "delivery_request",
        ts: new Date("2026-07-23T12:00:00Z"),
        status: 200,
        durationMs: 20,
        contentKind: "html",
        pageId: "home",
        entry: true,
        visitorHash: "a".repeat(64),
        device: "desktop",
        browser: "chrome",
    };
}
