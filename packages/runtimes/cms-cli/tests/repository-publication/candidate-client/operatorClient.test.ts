import { describe, expect, test } from "bun:test";
import { executeRepositoryOperator } from "../../../src/repositoryPublication/candidate/operator/client";
import {
    client,
    compatibility,
    DECISION_DIGEST,
    json,
    KIND,
    MANAGEMENT_URL,
    release,
    REPORT_DIGEST,
    scriptedFetch,
    type CapturedRequest,
    VERSION,
    versions,
} from "./operatorSupport";

describe("repository operator client", () => {
    test("derives the stable-promotion confirmation from exact release evidence", async () => {
        const capture = scriptedFetch([
            json(200, release()),
            json(201, {
                operationId: "promotion-1",
                record: { operationId: "promotion-1", kind: KIND, version: VERSION },
            }),
        ]);

        expect(
            await executeRepositoryOperator(client(capture.fetch), {
                type: "promote-stable",
                kind: KIND,
                version: VERSION,
                reason: "Release approved",
            }),
        ).toEqual({ outcome: "promoted", reference: "promotion-1" });
        expect(capture.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
            `GET ${MANAGEMENT_URL}/api/integrations/release?kind=commerce&version=1.2.0`,
            `POST ${MANAGEMENT_URL}/api/integrations/stable-promotions`,
        ]);
        expect(capture.requests[1]?.body).toEqual({
            kind: KIND,
            version: VERSION,
            currentReportRevisionId: "decision-1",
            confirmation: { version: VERSION, reportRevisionId: "decision-1" },
            reason: "Release approved",
        });
        assertAuthenticated(capture.requests);
    });

    test("derives the block decision and reports the committed channel repair", async () => {
        const capture = scriptedFetch([
            json(200, versions()),
            json(201, {
                operationId: "block-1",
                record: {
                    operationId: "block-1",
                    action: "block",
                    kind: KIND,
                    version: VERSION,
                    previousChannels: { stable: "1.3.0", latest: "1.3.0" },
                    nextChannels: { stable: "1.3.0", latest: "1.3.0" },
                },
            }),
        ]);

        expect(
            await executeRepositoryOperator(client(capture.fetch), {
                type: "block",
                kind: KIND,
                version: VERSION,
                reason: "Security regression",
            }),
        ).toEqual({
            outcome: "blocked",
            reference: "block-1",
            preview: { current: { stable: "1.3.0", latest: "1.3.0" }, next: { stable: "1.3.0", latest: "1.3.0" } },
        });
        expect(capture.requests[1]?.body).toEqual({
            kind: KIND,
            version: VERSION,
            currentDecision: { revisionId: "decision-1", digest: DECISION_DIGEST },
            reason: "Security regression",
            confirmation: {
                action: "block",
                kind: KIND,
                version: VERSION,
                decisionRevisionId: "decision-1",
                decisionDigest: DECISION_DIGEST,
            },
        });
        expect(capture.requests[1]?.body).not.toHaveProperty("actor");
    });

    test("pins reevaluation to both compatibility and composite decision evidence", async () => {
        const capture = scriptedFetch([
            json(200, compatibility()),
            json(200, release()),
            json(201, {
                revision: { kind: KIND, version: VERSION, reportId: "report-2" },
                currentReport: { revisionId: "report-2", reportDigest: "c".repeat(64) },
            }),
        ]);

        expect(
            await executeRepositoryOperator(client(capture.fetch), {
                type: "reevaluate",
                kind: KIND,
                version: VERSION,
                reason: "Comparator update",
            }),
        ).toEqual({ outcome: "reevaluated", reference: "report-2" });
        expect(capture.requests[2]?.body).toEqual({
            kind: KIND,
            version: VERSION,
            currentReport: { revisionId: "report-1", reportDigest: REPORT_DIGEST },
            currentDecision: { revisionId: "decision-1", digest: DECISION_DIGEST },
            reason: "Comparator update",
        });
        expect(capture.requests[2]?.body).not.toHaveProperty("actor");
    });

    test("fails closed on mismatched metadata and exposes only allowlisted upstream errors", async () => {
        const mismatched = scriptedFetch([json(200, { ...release(), version: "9.9.9" })]);
        expect(
            await executeRepositoryOperator(client(mismatched.fetch), {
                type: "promote-stable",
                kind: KIND,
                version: VERSION,
            }),
        ).toEqual({ outcome: "failed", reason: "invalid-response", status: 200 });

        const rejected = scriptedFetch([
            json(200, release()),
            json(
                422,
                { code: "integration_version_ineligible", error: "private registry path and secret" },
                { "retry-after": "5" },
            ),
        ]);
        expect(
            await executeRepositoryOperator(client(rejected.fetch), {
                type: "promote-stable",
                kind: KIND,
                version: VERSION,
            }),
        ).toEqual({
            outcome: "failed",
            reason: "upstream",
            status: 422,
            code: "integration_version_ineligible",
            retryAfterSeconds: 5,
        });
    });
});

function assertAuthenticated(requests: CapturedRequest[]): void {
    for (const request of requests) {
        expect(request.authorization).toBe("Bearer pat-admin");
        expect(request.redirect).toBe("error");
    }
}
