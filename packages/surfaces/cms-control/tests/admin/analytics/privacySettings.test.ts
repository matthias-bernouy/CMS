import { afterEach, describe, expect, test } from "bun:test";
import "cms-control/components/admin/Layout/AnalyticsPrivacySettings/AnalyticsPrivacySettings";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
    document.head.innerHTML = "";
});

describe("privacy analytics settings", () => {
    test("keeps collection controls and the compliance checklist in Settings", async () => {
        document.head.innerHTML = '<meta name="basePath" content="/cms">';
        const requests: string[] = [];
        globalThis.fetch = (async (input) => {
            const url = String(input);
            requests.push(url);
            if (url.endsWith("/analytics/settings")) {
                return Response.json({
                    enabled: true,
                    visitorEstimation: true,
                    rollupRetentionDays: 395,
                    privacyNoticeUrl: "https://example.test/privacy",
                });
            }
            return Response.json({
                evaluation: {
                    evaluatedAt: "2026-07-23T12:00:00Z",
                    checklistVersion: "cnil-audience-measurement-2026-01",
                    releaseReady: false,
                    criteria: [
                        {
                            id: "no_raw_events",
                            mode: "automatic",
                            label: "No raw events",
                            status: "pass",
                            evidence: "Aggregate writes only.",
                        },
                        {
                            id: "legal_review",
                            mode: "manual",
                            label: "Legal review",
                            status: "manual-review",
                            evidence: "No manual attestation recorded.",
                        },
                    ],
                },
                latestPublished: null,
                disclaimer: "Not a CNIL certification.",
                reporting: {
                    lastClosedBucket: "2026-07-23T12:00:00Z",
                    referrerSaturated: false,
                    versions: { filter: "strict-filter-v1" },
                },
            });
        }) as typeof fetch;

        const settings = document.createElement("cms-analytics-privacy-settings");
        document.body.append(settings);
        await waitFor(() => settings.querySelector<HTMLElement>('[data-state="ready"]')?.hidden === false);

        expect(requests).toEqual(["/cms/api/analytics/settings", "/cms/api/analytics/compliance"]);
        expect(settings.textContent).toContain("Privacy-strict analytics");
        expect(settings.textContent).toContain("Legal review");
        expect(settings.textContent).toContain("Not a CNIL certification");
        expect(settings.querySelector<HTMLInputElement>('input[name="rollupRetentionDays"]')?.value).toBe("395");
    });
});

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("Timed out waiting for privacy analytics settings");
}
