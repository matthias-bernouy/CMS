import type { RepositoryFetchCall } from "./fixtures";
import {
    admissionReport,
    compatibilityFixture,
    diagnosticsFixture,
    revisionReport,
    statusFixture,
    versionsFixture,
} from "./reportFixtures";

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
    if (path === "POST /cms/api/repository/publications") {
        return Response.json(
            {
                operationId: "publication-1",
                kind: "commerce",
                version: "1.2.0",
                digest: "c".repeat(64),
                report: admissionReport({ id: "admission-2", version: "1.2.0", packageDigest: "c".repeat(64) }),
            },
            { status: 201 },
        );
    }
    if (path === "POST /cms/api/repository/reevaluations") {
        return Response.json(
            {
                revision: revisionReport({ id: "revision-2", supersedes: "revision-1" }),
                currentReportRevisionId: "revision-2",
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
                    reportRevisionId: "revision-1",
                    previousStable: "1.0.0",
                    actor: "repository-owner@example.test",
                },
            },
            { status: 201 },
        );
    }
    return Response.json({ code: "not_found" }, { status: 404 });
}
