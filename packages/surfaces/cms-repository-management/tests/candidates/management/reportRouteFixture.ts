import type {
    IntegrationRegistryCandidateObjects,
    IntegrationRegistryCandidateRecord,
    IntegrationRegistryCandidateStore,
} from "@bernouy/cms-integration-registry";
import {
    createRepositoryManagementGuard,
    mountRepositoryCandidateManagementRoutes,
} from "@bernouy/cms-repository-management";
import type { CompatibilityReportV2 } from "@bernouy/cms-integration-verification";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest, type TestServer } from "@bernouy/http-runner/testing";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { candidateAdmission, candidatePolicy, candidateValue } from "../values";

const servers = new Set<TestServer>();
const CREATED_AT = "2026-07-26T10:00:00.000Z";

export async function reportFixture(status: IntegrationRegistryCandidateRecord["status"]) {
    const candidate = await candidateValue();
    const policy = await candidatePolicy();
    const admission = await candidateAdmission("candidate-1", candidate, policy);
    const record = {
        schema: "cms.integration.registry.candidate-record.v3",
        candidateId: "candidate-1",
        submittedBy: "admin@example.com",
        revision: 3,
        status,
        kind: candidate.envelope.package.kind,
        version: candidate.envelope.package.version,
        candidateDigest: candidate.candidateDigest,
        packageDigest: candidate.packageDigest,
        verificationDigest: candidate.verificationDigest,
        createdAt: CREATED_AT,
        updatedAt: "2026-07-26T10:04:00.000Z",
        expiresAt: "2026-07-27T10:00:00.000Z",
        attemptCount: status === "queued" ? 0 : 1,
        policyDigest: admission.policyDigest,
        admissionInputDigest: "8".repeat(64),
        migrationInputDigests: [],
        ...(status === "rejected"
            ? {
                  lastFailure: {
                      kind: "validation" as const,
                      code: "static-compatibility-rejected",
                      message: "PRIVATE-FAILURE-MESSAGE",
                      occurredAt: "2026-07-26T10:04:00.000Z",
                  },
              }
            : {}),
    } satisfies IntegrationRegistryCandidateRecord;
    const objects = {
        package: {
            ...candidate.envelope.package,
            files: {
                ...candidate.envelope.package.files,
                "private.sql": { encoding: "utf8" as const, content: "PRIVATE-SQL" },
            },
        },
        verification: {
            ...candidate.envelope.verification,
            files: {
                ...candidate.envelope.verification.files,
                "fixtures/private.json": { encoding: "utf8" as const, content: "PRIVATE-FIXTURE" },
            },
        },
        policy,
        admission,
        migrationInputs: [],
    } satisfies IntegrationRegistryCandidateObjects;
    return { candidate, record, objects };
}

export function compatibility(record: IntegrationRegistryCandidateRecord): CompatibilityReportV2 {
    return {
        schema: "cms.integration.compatibility-report.v2",
        reportId: "compatibility-1",
        revisionType: "root",
        origin: "admission",
        createdAt: CREATED_AT,
        kind: record.kind,
        version: record.version,
        packageDigest: record.packageDigest,
        evaluator: { name: "static-compatibility", version: "1.0.0" },
        baselines: [],
        informationalBaselines: [],
        findings: [
            {
                findingId: "finding-1",
                classification: "unknown",
                surface: "schema",
                code: "schema-review-required",
                path: "connectors.primary.schema",
                message: "Schema declaration needs review",
                baselineDigest: "6".repeat(64),
                candidateDigest: record.packageDigest,
            },
        ],
        outcome: "unknown",
        requiredReleaseLevel: "major",
        releaseLevel: "minor",
        contractAdmissible: false,
        noBaselineReason: "new-kind",
        provenance: { actor: "repository-private-actor", reason: "credential review" },
    };
}

export function reportServer(
    record: IntegrationRegistryCandidateRecord | null,
    objects: IntegrationRegistryCandidateObjects,
): TestServer {
    const runner = new BunRunner();
    const store = {
        get: async () => record,
        objects: async () => objects,
    } as IntegrationRegistryCandidateStore;
    const guard = createRepositoryManagementGuard({
        serviceToken: "management-secret",
        servicePrincipal: "management-cms",
        rateLimiter: new InMemoryRateLimiter({ limit: 100, windowSeconds: 60 }),
    });
    runner.group(
        "/.cms/repository-management",
        (scoped) =>
            mountRepositoryCandidateManagementRoutes(scoped, {
                store,
                admission: { submit: async () => record! },
                maxBodyBytes: 1_024,
                candidateTtlMs: 60_000,
                now: () => CREATED_AT,
                createCandidateId: () => "unused",
            }),
        [guard],
    );
    const server = serveForTest(runner);
    servers.add(server);
    return server;
}

export function reportRequest(server: TestServer): Promise<Response> {
    return server.request("GET", reportPath(), { headers: { authorization: "Bearer management-secret" } });
}

export function reportPath(): string {
    return "/.cms/repository-management/api/integrations/candidates/report?candidateId=candidate-1";
}

export function stopReportServers(): void {
    for (const server of servers) {
        server.stop();
    }
    servers.clear();
}
