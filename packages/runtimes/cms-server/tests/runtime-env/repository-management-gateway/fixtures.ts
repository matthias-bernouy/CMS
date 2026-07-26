import { canonicalJsonBytes, sha256Hex, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import {
    HttpRepositoryManagementGateway,
    type HttpRepositoryManagementGatewayConfig,
} from "../../../src/repositoryManagement/gateway";
import {
    admissionReport,
    compatibilityPage,
    promotionRecord,
    revisionReport,
    TEST_DIGEST,
    TEST_KIND,
    TEST_VERSION,
} from "./reports";

export const TEST_TOKEN = "server-only-token";
export const TEST_ACTOR = "administrator-subject";

export type PackageFixture = Readonly<{
    bytes: Uint8Array;
    digest: string;
    envelope: IntegrationPackageEnvelopeV1;
}>;

export function gateway(
    fetchImpl: typeof fetch,
    overrides: Partial<HttpRepositoryManagementGatewayConfig> = {},
): HttpRepositoryManagementGateway {
    return new HttpRepositoryManagementGateway({
        baseUrl: "https://repository.internal/.cms/repository-management/",
        token: TEST_TOKEN,
        administratorSubjectIdentifier: TEST_ACTOR,
        timeoutMs: 1_000,
        fetch: fetchImpl,
        ...overrides,
    });
}

export async function packageFixture(): Promise<PackageFixture> {
    const envelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind: TEST_KIND,
        version: TEST_VERSION,
        definition: "integration.json",
        releaseNotes: "README.md",
        files: {
            "README.md": { encoding: "utf8", content: "# Release 1.2.3\n" },
            "integration.json": { encoding: "utf8", content: "{}" },
        },
    };
    const bytes = canonicalJsonBytes(envelope);
    return { envelope, bytes, digest: await sha256Hex(bytes) };
}

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
    return Response.json(body, { status, headers });
}

export function validStatus(): Readonly<Record<string, unknown>> {
    return {
        ready: true,
        health: "healthy",
        integrations: 1,
        versions: 1,
        diagnostics: 0,
        quarantined: 0,
        recoveryDiagnostics: 0,
    };
}

export function validDiagnostics(): Readonly<Record<string, unknown>> {
    return { health: "healthy", diagnostics: [], quarantined: [], recovery: [] };
}

export function validVersions(): Readonly<Record<string, unknown>> {
    return {
        kind: TEST_KIND,
        stable: TEST_VERSION,
        latest: TEST_VERSION,
        versions: [{ version: TEST_VERSION, digest: "a".repeat(64), compatibility: null }],
    };
}

export function validPublication(digest: string): Readonly<Record<string, unknown>> {
    return {
        operationId: "publication-operation",
        kind: TEST_KIND,
        version: TEST_VERSION,
        digest,
        report: admissionReport({ packageDigest: digest }),
    };
}

export function managementResponseFor(url: URL, packageDigest: string, after: string): Response {
    if (url.pathname.endsWith("/api/status")) {
        return jsonResponse(validStatus());
    }
    if (url.pathname.endsWith("/api/diagnostics")) {
        return jsonResponse(validDiagnostics());
    }
    if (url.pathname.endsWith("/api/integrations/versions")) {
        return jsonResponse(validVersions());
    }
    if (url.pathname.endsWith("/api/integrations/compatibility")) {
        const revision = revisionReport({ supersedes: after });
        return jsonResponse(compatibilityPage({ current: revision, revisions: [revision], totalRevisions: 2 }));
    }
    if (url.pathname.endsWith("/api/integrations/publications")) {
        return jsonResponse(validPublication(packageDigest), 201);
    }
    if (url.pathname.endsWith("/api/integrations/compatibility/reevaluations")) {
        return jsonResponse(
            {
                revision: revisionReport({
                    packageDigest: TEST_DIGEST,
                    provenance: {
                        actor: TEST_ACTOR,
                        reason: "Manual evidence review",
                        evidenceIds: ["evidence-a", "evidence-z"],
                    },
                }),
                currentReportRevisionId: "report-revision",
            },
            201,
        );
    }
    if (url.pathname.endsWith("/api/integrations/stable-promotions")) {
        return jsonResponse({ operationId: "promotion-operation", record: promotionRecord() }, 201);
    }
    return jsonResponse({ error: "unexpected" }, 500);
}

export async function responseBody(response: Response): Promise<Record<string, unknown>> {
    return (await response.json()) as Record<string, unknown>;
}
