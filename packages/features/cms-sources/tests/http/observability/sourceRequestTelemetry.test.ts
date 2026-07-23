import { describe, expect, mock, test } from "bun:test";
import { isValidCorrelationId } from "@bernouy/http-runner";
import {
    UNRESOLVED_SOURCE_ENDPOINT,
    createSourceRequestTelemetryMiddleware,
    handleSourceRequest,
    type SourceRequestDiagnostic,
    type SourceRequestObservation,
} from "@bernouy/cms-sources";
import { okFetch, seededSourceRepository, SOURCE_PREFIX } from "../handleSourceFixtures";

describe("source request telemetry", () => {
    test("reports one bounded observation for success and returns the correlation id", async () => {
        const observations: SourceRequestObservation[] = [];
        let now = 0;
        const response = await handleSourceRequest(
            await seededSourceRepository(),
            new Request(`http://local${SOURCE_PREFIX}shop/getCart`, {
                headers: { "x-cms-correlation-id": "private@example.com" },
            }),
            {
                prefix: SOURCE_PREFIX,
                deps: {
                    fetchImpl: okFetch(),
                    telemetry: {
                        observe: (observation) => observations.push(observation),
                        clock: () => ++now,
                        now: () => new Date("2026-07-23T10:00:00.000Z"),
                    },
                },
            },
        );

        expect(response.status).toBe(200);
        expect(observations).toHaveLength(1);
        expect(observations[0]).toMatchObject({
            observedAt: new Date("2026-07-23T10:00:00.000Z"),
            endpointUrn: "urn:shop:getCart",
            method: "GET",
            status: 200,
            outcome: "success",
        });
        expect(isValidCorrelationId(observations[0]!.correlationId)).toBe(true);
        expect(response.headers.get("x-cms-correlation-id")).toBe(observations[0]!.correlationId);
        expect(observations[0]!.stagesMs).toEqual(
            expect.objectContaining({
                cms_endpoint_auth_lookup: expect.any(Number),
                cms_upstream: expect.any(Number),
                cms_total: expect.any(Number),
            }),
        );
        expect(Object.keys(observations[0]!)).not.toContain("url");
        expect(Object.isFrozen(observations[0]!.stagesMs)).toBe(true);
    });

    test.each([
        ["not found", "shop/missing", "GET", 404, UNRESOLVED_SOURCE_ENDPOINT],
        ["method mismatch", "shop/getCart", "POST", 405, UNRESOLVED_SOURCE_ENDPOINT],
    ])("reports unresolved %s requests without their raw path", async (_name, path, method, status, endpointUrn) => {
        const observations: SourceRequestObservation[] = [];
        const response = await handleSourceRequest(
            await seededSourceRepository(),
            new Request(`http://local${SOURCE_PREFIX}${path}?secret=value`, { method }),
            { prefix: SOURCE_PREFIX, deps: { telemetry: { observe: (value) => observations.push(value) } } },
        );

        expect(response.status).toBe(status);
        expect(observations).toHaveLength(1);
        expect(observations[0]!.endpointUrn).toBe(endpointUrn);
        expect(JSON.stringify(observations[0])).not.toContain("secret");
        expect(observations[0]!.stagesMs.cms_upstream).toBe(0);
    });

    test("keeps uniform and forced diagnostic cohorts explicit and non-blocking", async () => {
        const diagnostics: SourceRequestDiagnostic[] = [];
        const reportDiagnostic = mock((diagnostic: SourceRequestDiagnostic) => {
            diagnostics.push(diagnostic);
            return Promise.reject(new Error("logger unavailable"));
        });
        const response = await handleSourceRequest(
            await seededSourceRepository(),
            new Request(`http://local${SOURCE_PREFIX}shop/getCart`),
            {
                prefix: SOURCE_PREFIX,
                deps: {
                    authorizeEndpoint: async () => false,
                    telemetry: {
                        reportDiagnostic,
                        uniformSampleRate: 1,
                        random: () => 0.5,
                    },
                },
            },
        );

        expect(response.status).toBe(403);
        expect(reportDiagnostic).toHaveBeenCalledTimes(1);
        expect(diagnostics[0]!.cohorts).toEqual(["uniform", "forced"]);
        expect(diagnostics[0]).not.toHaveProperty("request");
        expect(diagnostics[0]).not.toHaveProperty("headers");
    });

    test("a broken observer and Server-Timing policy cannot change the business response", async () => {
        const response = await handleSourceRequest(
            await seededSourceRepository(),
            new Request(`http://local${SOURCE_PREFIX}shop/getCart`),
            {
                prefix: SOURCE_PREFIX,
                deps: {
                    fetchImpl: okFetch(),
                    telemetry: {
                        observe: () => {
                            throw new Error("metrics unavailable");
                        },
                        exposeServerTiming: () => {
                            throw new Error("policy unavailable");
                        },
                    },
                },
            },
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
        expect(response.headers.get("server-timing")).toBeNull();
    });

    test("an outer middleware includes work before the handler and exposes only stable timing names", async () => {
        const middleware = createSourceRequestTelemetryMiddleware({
            exposeServerTiming: () => true,
        });
        const request = new Request(`http://local${SOURCE_PREFIX}shop/getCart`);
        const response = await middleware(request, async () =>
            handleSourceRequest(await seededSourceRepository(), request, {
                prefix: SOURCE_PREFIX,
                deps: { fetchImpl: okFetch() },
            }),
        );

        expect(response.headers.get("server-timing")).toContain("cms_total;dur=");
        expect(response.headers.get("server-timing")).toContain("cms_upstream;dur=");
        expect(response.headers.get("server-timing")).not.toContain("urn:shop");
    });
});
