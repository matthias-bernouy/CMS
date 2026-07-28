import { describe, expect, test } from "bun:test";
import type { EndpointPerformanceObservation } from "@bernouy/cms-analytics";
import {
    createIntegrationPackageCacheObserver,
    createSourceTelemetryOptions,
    createTrustedConnectorTargetMatcher,
} from "../../src/runtime/sourceTelemetry";

describe("production source telemetry", () => {
    test("maps exhaustive observations without persisting correlation identifiers", () => {
        const observations: EndpointPerformanceObservation[] = [];
        const logs: string[] = [];
        const telemetry = createSourceTelemetryOptions(
            "delivery",
            { observe: (observation) => observations.push(observation) },
            { uniformSampleRate: 0.25, slowRequestThresholdMs: 750, reportDiagnostic: (line) => logs.push(line) },
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
        expect(logs).toEqual([]);
    });

    test("logs only the redacted diagnostic contract", () => {
        const logs: string[] = [];
        const telemetry = createSourceTelemetryOptions(
            "control",
            { observe() {} },
            { uniformSampleRate: 1, slowRequestThresholdMs: 500, reportDiagnostic: (line) => logs.push(line) },
        );
        telemetry.reportDiagnostic?.({
            observedAt: new Date("2026-07-23T12:00:00.000Z"),
            correlationId: "01962ba3-9378-4f0f-a122-d2a8d89f1871",
            endpointUrn: "urn:products:list",
            method: "GET",
            status: 504,
            outcome: "timeout",
            stagesMs: { cms_total: 1_000 },
            cohorts: ["uniform", "forced"],
        });

        expect(JSON.parse(logs[0]!)).toEqual({
            event: "cms_source_request",
            surface: "control",
            cohorts: ["uniform", "forced"],
            correlationId: "01962ba3-9378-4f0f-a122-d2a8d89f1871",
            endpointUrn: "urn:products:list",
            method: "GET",
            status: 504,
            outcome: "timeout",
            stagesMs: { cms_total: 1_000 },
        });
        expect(logs[0]).not.toContain("observedAt");
        expect(logs[0]).not.toContain("url");
    });

    test("trusts only previewed connector origins and path boundaries", async () => {
        const matcher = await createTrustedConnectorTargetMatcher([
            {
                provider: "supabase",
                async previewOutputs() {
                    return { functionsBaseUrl: "https://project.supabase.co/functions/v1/" };
                },
                async deploy() {
                    throw new Error("not used");
                },
            },
            {
                provider: "broken",
                async previewOutputs() {
                    throw new Error("configuration unavailable");
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

    test("logs only bounded integration package cache metric fields", () => {
        const logs: string[] = [];
        const observe = createIntegrationPackageCacheObserver((message) => logs.push(message));

        observe({
            type: "materialized",
            digest: "a".repeat(64),
            kind: "commerce",
            version: "1.0.0",
            bytes: 4_096,
            durationMs: 17,
            path: "/var/lib/cms/integration-packages/private",
            token: "repository-secret",
            packageContents: "do-not-log",
        } as never);

        expect(JSON.parse(logs[0]!)).toEqual({
            event: "cms_integration_package_cache",
            outcome: "materialized",
            digest: "a".repeat(64),
            kind: "commerce",
            version: "1.0.0",
            bytes: 4_096,
            durationMs: 17,
        });
        expect(logs[0]).not.toContain("/var/lib/cms");
        expect(logs[0]).not.toContain("repository-secret");
        expect(logs[0]).not.toContain("do-not-log");
    });
});
