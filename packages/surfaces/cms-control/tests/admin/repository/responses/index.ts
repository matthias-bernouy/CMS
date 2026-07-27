import type { RepositoryFetchCall } from "../fixtures";
import {
    compatibilityFixture,
    diagnosticsFixture,
    revisionReport,
    releaseFixture,
    statusFixture,
    versionsFixture,
} from "../reportFixtures";
import { candidateReportFixture } from "./candidateReport";

export { candidateReportFixture } from "./candidateReport";

export function defaultRepositoryResponse(call: RepositoryFetchCall): Response {
    const path = `${call.method} ${call.url.pathname}`;
    if (path === "GET /cms/api/repository/status") {
        return Response.json(statusFixture);
    }
    if (path === "GET /cms/api/repository/diagnostics") {
        return Response.json(diagnosticsFixture);
    }
    if (path === "GET /cms/api/repository/versions") {
        return Response.json(versionsFixture);
    }
    if (path === "GET /cms/api/repository/compatibility") {
        return Response.json(compatibilityFixture());
    }
    if (path === "GET /cms/api/repository/release") {
        return Response.json(releaseFixture());
    }
    if (path === "GET /cms/api/repository/candidates/report") {
        return Response.json(candidateReportFixture());
    }
    if (path === "POST /cms/api/repository/candidates" || path === "GET /cms/api/repository/candidates/status") {
        return Response.json(
            {
                candidate: {
                    candidateId: "candidate-1",
                    revision: 4,
                    status: "published",
                    kind: "commerce",
                    version: "1.2.0",
                    candidateDigest: "5".repeat(64),
                    packageDigest: "c".repeat(64),
                    verificationDigest: "6".repeat(64),
                    createdAt: "2026-07-26T12:00:00.000Z",
                    updatedAt: "2026-07-26T12:01:00.000Z",
                    expiresAt: "2026-07-27T12:00:00.000Z",
                    attemptCount: 1,
                },
            },
            { status: path.startsWith("POST") ? 202 : 200 },
        );
    }
    if (path === "POST /cms/api/repository/reevaluations") {
        return Response.json(
            {
                revision: revisionReport({ reportId: "revision-2", supersedes: "revision-1" }),
                currentReport: { revisionId: "revision-2", reportDigest: "f".repeat(64) },
            },
            { status: 201 },
        );
    }
    if (path === "POST /cms/api/repository/stable-promotions") {
        return Response.json(
            {
                operationId: "promotion-1",
                record: {
                    kind: "commerce",
                    version: "1.1.0",
                    reportRevisionId: "decision-1",
                    previousStable: "1.0.0",
                    actor: "repository-owner@example.test",
                },
            },
            { status: 201 },
        );
    }
    if (path === "POST /cms/api/repository/version-blocks") {
        return Response.json(
            {
                operationId: "block-1",
                record: {
                    kind: "commerce",
                    version: "1.1.0",
                    nextChannels: { stable: "1.0.0", latest: "1.0.0" },
                },
            },
            { status: 201 },
        );
    }
    return Response.json({ code: "not_found" }, { status: 404 });
}
