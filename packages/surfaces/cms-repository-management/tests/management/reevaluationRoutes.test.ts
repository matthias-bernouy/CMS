import { describe, expect, test } from "bun:test";
import {
    IntegrationCompatibilityReevaluationConflictError,
    IntegrationCompatibilityReevaluationIntegrityError,
    IntegrationCompatibilityReevaluationNotFoundError,
    IntegrationCompatibilityReevaluationStaleDecisionError,
    IntegrationCompatibilityReevaluationStaleReportError,
} from "@bernouy/cms-integration-registry";
import { configuredRunner, RecordingReevaluator, reevaluationBody } from "./reevaluationSupport";

describe("repository compatibility reevaluation route", () => {
    test("delegates the exact request and returns the provenance-bearing revision", async () => {
        const reevaluator = new RecordingReevaluator();
        const runner = configuredRunner(reevaluator);

        const response = await runner.request(reevaluationBody());
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(reevaluator.requests).toEqual([reevaluationBody()]);
        expect(body).toEqual({
            currentReport: { revisionId: "revision-2", reportDigest: "c".repeat(64) },
            revision: expect.objectContaining({
                reportId: "revision-2",
                supersedes: "report-2",
                provenance: {
                    actor: "repository-owner",
                    reason: "Run evaluator version 2",
                    evidenceIds: ["schema-ci-2"],
                },
            }),
        });
    });

    test("maps absent and stale history with stable safe metadata", async () => {
        const absent = configuredRunner(
            new RecordingReevaluator(new IntegrationCompatibilityReevaluationNotFoundError("commerce", "1.1.0")),
        );
        const absentResponse = await absent.request(reevaluationBody());
        expect(absentResponse.status).toBe(404);
        expect(await absentResponse.json()).toEqual({
            code: "integration_compatibility_reevaluation_not_found",
            error: "Integration compatibility history was not found",
        });

        const stale = configuredRunner(
            new RecordingReevaluator(new IntegrationCompatibilityReevaluationStaleReportError("report-1", "report-2")),
        );
        const staleResponse = await stale.request(reevaluationBody());
        expect(staleResponse.status).toBe(409);
        expect(await staleResponse.json()).toEqual({
            code: "integration_compatibility_reevaluation_stale_report",
            error: "Compatibility report revision is stale",
            currentReportRevisionId: "report-2",
        });

        const staleDecision = configuredRunner(
            new RecordingReevaluator(
                new IntegrationCompatibilityReevaluationStaleDecisionError("decision-3", "c".repeat(64)),
            ),
        );
        const staleDecisionResponse = await staleDecision.request(reevaluationBody());
        expect(staleDecisionResponse.status).toBe(409);
        expect(await staleDecisionResponse.json()).toEqual({
            code: "integration_compatibility_reevaluation_stale_decision",
            error: "Release admission decision is stale",
            currentDecision: { revisionId: "decision-3", digest: "c".repeat(64) },
        });
    });

    test("sanitizes integrity, append conflict, and unexpected failures", async () => {
        const failures: Array<readonly [Error, number, string]> = [
            [
                new IntegrationCompatibilityReevaluationIntegrityError("private baseline /var/lib/repository"),
                409,
                "integration_compatibility_reevaluation_integrity_conflict",
            ],
            [
                new IntegrationCompatibilityReevaluationConflictError("private generated report ID"),
                409,
                "integration_compatibility_reevaluation_conflict",
            ],
            [new Error("secret adapter failure /var/lib/repository"), 500, "management_operation_failed"],
        ];
        for (const [failure, status, code] of failures) {
            const response = await configuredRunner(new RecordingReevaluator(failure)).request(reevaluationBody());
            const serialized = await response.text();
            expect(response.status).toBe(status);
            expect(JSON.parse(serialized)).toMatchObject({ code });
            expect(serialized).not.toContain("private");
            expect(serialized).not.toContain("secret");
            expect(serialized).not.toContain("/var/lib/repository");
        }
    });

    test("rejects missing, malformed, and extra request fields with 422", async () => {
        const reevaluator = new RecordingReevaluator();
        const runner = configuredRunner(reevaluator);
        for (const body of [
            { ...reevaluationBody(), actor: undefined },
            { ...reevaluationBody(), evidenceIds: ["valid", 42] },
            { ...reevaluationBody(), injected: true },
        ]) {
            const response = await runner.request(body);
            expect(response.status).toBe(422);
            expect(await response.json()).toEqual({
                code: "integration_compatibility_reevaluation_invalid",
                error: "Compatibility reevaluation request is invalid",
            });
        }
        expect(reevaluator.requests).toEqual([]);
    });

    test("bounds JSON before delegation and keeps malformed JSON distinct", async () => {
        const reevaluator = new RecordingReevaluator();
        const runner = configuredRunner(reevaluator, 128);

        const oversized = await runner.raw(JSON.stringify({ value: "x".repeat(256) }));
        const malformed = await runner.raw("{");

        expect(oversized.status).toBe(413);
        expect(await oversized.json()).toMatchObject({ code: "management_request_too_large" });
        expect(malformed.status).toBe(400);
        expect(await malformed.json()).toMatchObject({ code: "management_request_invalid" });
        expect(reevaluator.requests).toEqual([]);
    });
});
