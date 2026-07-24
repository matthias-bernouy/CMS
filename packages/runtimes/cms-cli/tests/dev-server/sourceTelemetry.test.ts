import { describe, expect, test } from "bun:test";
import type { EndpointPerformanceObservation } from "@bernouy/cms-analytics";
import {
    createLocalSourceTelemetry,
    createLocalTrustedConnectorTargetMatcher,
} from "../../src/dev-server/runtime/sourceTelemetry";

describe("local source telemetry", () => {
    test("maps exhaustive observations without retaining the correlation identifier", () => {
        const observations: EndpointPerformanceObservation[] = [];
        const telemetry = createLocalSourceTelemetry(
            "delivery",
            { observe: (observation) => observations.push(observation) },
            1,
        );
        telemetry.observe?.({
            observedAt: new Date("2026-07-23T12:00:00.000Z"),
            correlationId: "01962ba3-9378-4f0f-a122-d2a8d89f1871",
            endpointUrn: "urn:products:list",
            method: "GET",
            status: 200,
            outcome: "success",
            stagesMs: { cms_upstream: 120, cms_total: 150 },
        });

        expect(observations).toEqual([
            {
                ts: new Date("2026-07-23T12:00:00.000Z"),
                surface: "delivery",
                endpointUrn: "urn:products:list",
                method: "GET",
                status: 200,
                stagesMs: { cms_upstream: 120, cms_total: 150 },
            },
        ]);
        expect(JSON.stringify(observations)).not.toContain("01962ba3");
    });

    test("trusts only previewed connector origins and path boundaries", async () => {
        const matcher = await createLocalTrustedConnectorTargetMatcher([
            {
                provider: "supabase",
                async previewOutputs() {
                    return { functionsBaseUrl: "https://project.supabase.co/functions/v1/" };
                },
                async deploy() {
                    throw new Error("not used");
                },
            },
        ]);
        const endpoint = {} as never;

        expect(matcher(endpoint, new URL("https://project.supabase.co/functions/v1/catalog"))).toBe(true);
        expect(matcher(endpoint, new URL("https://project.supabase.co/functions/v10/catalog"))).toBe(false);
        expect(matcher(endpoint, new URL("https://attacker.test/functions/v1/catalog"))).toBe(false);
    });
});
