import { describe, expect, test } from "bun:test";
import { REPOSITORY_MANAGEMENT_UPLOAD_LIMIT_BYTES } from "../../../src/repositoryManagement/gateway";
import { gateway, jsonResponse, packageFixture, responseBody, validStatus } from "./fixtures";
import { admissionReport, TEST_KIND, TEST_VERSION } from "./reports";

describe("HTTP repository management gateway error mapping", () => {
    test("preserves only expected not-found and conflict statuses with sanitized bodies", async () => {
        const publication = await packageFixture();
        const versions = gateway(oneResponse({ code: "integration_not_found", error: "raw upstream text" }, 404));
        expect(await responseBody(await versions.versions(TEST_KIND))).toEqual({
            code: "integration_not_found",
            error: "Integration was not found",
        });
        const compatibility = gateway(
            oneResponse({ code: "compatibility_history_not_found", error: "raw upstream text" }, 404),
        );
        expect((await compatibility.compatibility({ kind: TEST_KIND, version: TEST_VERSION })).status).toBe(404);
        const promotionNotFound = gateway(
            oneResponse({ code: "integration_registry_stable_promotion_not_found", error: "raw upstream text" }, 404),
        );
        expect((await promotionNotFound.promoteStable(promotionInput())).status).toBe(404);

        const publicationConflict = gateway(
            oneResponse(
                {
                    code: "integration_version_exists",
                    error: "raw path /private/registry",
                    kind: TEST_KIND,
                    version: TEST_VERSION,
                    existingDigest: publication.digest,
                },
                409,
            ),
        );
        const conflict = await publicationConflict.publish(publication.bytes);
        expect(conflict.status).toBe(409);
        expect(await responseBody(conflict)).toEqual({
            code: "integration_version_exists",
            error: "Integration version already exists",
            kind: TEST_KIND,
            version: TEST_VERSION,
            existingDigest: publication.digest,
        });

        const reevaluation = gateway(
            oneResponse(
                {
                    code: "integration_compatibility_reevaluation_stale_report",
                    error: "raw upstream text",
                    currentReportRevisionId: "report-revision",
                },
                409,
            ),
        );
        const stale = await reevaluation.reevaluate({
            kind: TEST_KIND,
            version: TEST_VERSION,
            currentReportRevisionId: "report-admission",
            currentDecision: { revisionId: "decision-admission", digest: "d".repeat(64) },
            reason: "Manual evidence review",
        });
        expect(stale.status).toBe(409);
        expect(await responseBody(stale)).toEqual({
            code: "integration_compatibility_reevaluation_stale_report",
            error: "Compatibility report revision is stale",
            currentReportRevisionId: "report-revision",
        });
    });

    test("preserves bounded rejection, upload, and rate-limit responses", async () => {
        const publication = await packageFixture();
        const rejected = gateway(
            oneResponse(
                {
                    code: "integration_compatibility_rejected",
                    error: "raw upstream text",
                    report: admissionReport({ packageDigest: publication.digest }),
                },
                422,
            ),
        );
        expect((await rejected.publish(publication.bytes)).status).toBe(422);
        const ineligible = gateway(
            oneResponse(
                {
                    code: "integration_registry_stable_promotion_ineligible",
                    error: "raw upstream text",
                    reportRevisionId: "report-admission",
                },
                422,
            ),
        );
        expect((await ineligible.promoteStable(promotionInput())).status).toBe(422);
        const tooLarge = gateway(
            oneResponse({ code: "management_request_too_large", error: "raw upstream text" }, 413),
        );
        expect((await tooLarge.promoteStable(promotionInput())).status).toBe(413);
        const limited = gateway(
            oneResponse({ code: "management_rate_limited", error: "raw upstream text", retryAfterSeconds: 7 }, 429, {
                "retry-after": "7",
            }),
        );
        const rateLimit = await limited.status();
        expect(rateLimit.status).toBe(429);
        expect(rateLimit.headers.get("retry-after")).toBe("7");
        expect(await responseBody(rateLimit)).toEqual({
            code: "management_rate_limited",
            error: "Repository management rate limit exceeded",
            retryAfterSeconds: 7,
        });
    });

    test("rejects oversized local uploads and invalid Retry-After values", async () => {
        let calls = 0;
        const client = gateway((async () => {
            calls += 1;
            return jsonResponse(validStatus());
        }) as typeof fetch);
        const oversized = await client.publish(new Uint8Array(REPOSITORY_MANAGEMENT_UPLOAD_LIMIT_BYTES + 1));
        expect(oversized.status).toBe(413);
        expect(calls).toBe(0);

        for (const retryAfter of [null, "0", "7.5", "Wed, 21 Oct 2026 07:28:00 GMT", "8"]) {
            const limited = gateway(
                oneResponse(
                    { code: "management_rate_limited", error: "limited", retryAfterSeconds: 7 },
                    429,
                    retryAfter ? { "retry-after": retryAfter } : {},
                ),
            );
            expect((await limited.status()).status).toBe(503);
        }
    });

    test("maps every unexpected upstream status to 503", async () => {
        for (const status of [400, 401, 403, 404, 409, 413, 422, 500, 502]) {
            const client = gateway(oneResponse({ code: "unexpected", error: "raw" }, status));
            expect((await client.status()).status).toBe(503);
        }
    });
});

function oneResponse(body: unknown, status = 200, headers: HeadersInit = {}): typeof fetch {
    return (async () => jsonResponse(body, status, headers)) as typeof fetch;
}

function promotionInput() {
    return {
        kind: TEST_KIND,
        version: TEST_VERSION,
        currentReportRevisionId: "report-admission",
        confirmation: { version: TEST_VERSION, reportRevisionId: "report-admission" },
    };
}
