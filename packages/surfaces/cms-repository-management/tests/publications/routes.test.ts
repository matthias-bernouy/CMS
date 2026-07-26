import { describe, expect, test } from "bun:test";
import {
    canonicalJsonBytes,
    sha256Hex,
    type IntegrationPackageEnvelopeV1,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import {
    IntegrationCompatibilityAdmissionError,
    IntegrationRegistryVersionConflictError,
    IntegrationRegistryVersionOrderError,
    type IntegrationCompatibilityAdmissionReport,
    type IntegrationRegistryPublisher,
} from "@bernouy/cms-integration-registry";
import { RepositoryManagementCms, REPOSITORY_PUBLICATION_PATH } from "@bernouy/cms-repository-management";
import type { Runner } from "@bernouy/http-runner";
import { PublicationTestRunner, responseJson } from "./support";

describe("repository management publication route", () => {
    test("publishes the canonical package and returns the immutable admission result", async () => {
        const fixture = await packageFixture();
        const published: ResolvedIntegrationPackage[] = [];
        const publisher = publisherFrom(async (request) => {
            published.push(request.package);
            return publicationResult(request.package, report(request.package));
        });
        const response = await mounted(publisher).handle(REPOSITORY_PUBLICATION_PATH, packageRequest(fixture.bytes));

        expect(response.status).toBe(201);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(published).toEqual([
            { envelope: fixture.envelope, canonicalBytes: fixture.bytes, digest: fixture.digest },
        ]);
        expect(await responseJson(response)).toMatchObject({
            operationId: "publication-demo-1.0.0",
            kind: "demo",
            version: "1.0.0",
            digest: fixture.digest,
            report: { reportType: "admission", packageDigest: fixture.digest },
        });
    });

    test.each([
        [new IntegrationRegistryVersionConflictError("demo", "1.0.0"), "integration_version_exists"],
        [new IntegrationRegistryVersionOrderError("demo", "1.0.0", "1.1.0"), "integration_version_not_newer"],
    ])("maps immutable version conflicts to structured 409 responses", async (failure, code) => {
        const fixture = await packageFixture();
        const response = await mounted(publisherFrom(async () => Promise.reject(failure))).handle(
            REPOSITORY_PUBLICATION_PATH,
            packageRequest(fixture.bytes),
        );

        expect(response.status).toBe(409);
        expect(await responseJson(response)).toMatchObject({ code, kind: "demo", version: "1.0.0" });
    });

    test("returns the complete immutable compatibility report on rejection", async () => {
        const fixture = await packageFixture();
        const rejected = report(
            { envelope: fixture.envelope, canonicalBytes: fixture.bytes, digest: fixture.digest },
            { outcome: "breaking", admissible: false, requiredReleaseLevel: "major", releaseLevel: "patch" },
        );
        const response = await mounted(
            publisherFrom(async () => Promise.reject(new IntegrationCompatibilityAdmissionError(rejected))),
        ).handle(REPOSITORY_PUBLICATION_PATH, packageRequest(fixture.bytes));

        expect(response.status).toBe(422);
        expect(await responseJson(response)).toMatchObject({
            code: "integration_compatibility_rejected",
            report: { id: rejected.id, outcome: "breaking", admissible: false },
        });
    });

    test("rejects malformed uploads without calling the publisher", async () => {
        let calls = 0;
        const response = await mounted(
            publisherFrom(async () => {
                calls += 1;
                throw new Error("must not run");
            }),
        ).handle(REPOSITORY_PUBLICATION_PATH, packageRequest(new TextEncoder().encode("{}")));

        expect(response.status).toBe(400);
        expect(await responseJson(response)).toMatchObject({ code: "management_package_upload_invalid" });
        expect(calls).toBe(0);
    });

    test("sanitizes unexpected publisher failures", async () => {
        const fixture = await packageFixture();
        const response = await mounted(
            publisherFrom(async () => Promise.reject(new Error("filesystem leaked management-secret"))),
        ).handle(REPOSITORY_PUBLICATION_PATH, packageRequest(fixture.bytes));
        const serialized = await response.text();

        expect(response.status).toBe(500);
        expect(JSON.parse(serialized)).toEqual({
            error: "Repository management operation failed",
            code: "management_operation_failed",
        });
        expect(serialized).not.toContain("filesystem");
        expect(serialized).not.toContain("management-secret");
    });
});

function mounted(publisher: IntegrationRegistryPublisher): PublicationTestRunner {
    const runner = new PublicationTestRunner();
    new RepositoryManagementCms({
        runner: runner as Runner,
        publisher,
        upload: { maxBodyBytes: 1024 * 1024 },
    });
    return runner;
}

function publisherFrom(publish: IntegrationRegistryPublisher["publish"]): IntegrationRegistryPublisher {
    return { publish };
}

function packageRequest(bytes: Uint8Array): RequestInit {
    return { method: "POST", headers: { "content-type": "application/json" }, body: bytes };
}

async function packageFixture() {
    const envelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind: "demo",
        version: "1.0.0",
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: "{}" },
            "release-notes.md": { encoding: "utf8", content: "# Initial release\n" },
        },
    };
    const bytes = canonicalJsonBytes(envelope);
    return { envelope, bytes, digest: await sha256Hex(bytes) };
}

function publicationResult(
    integrationPackage: ResolvedIntegrationPackage,
    admission: IntegrationCompatibilityAdmissionReport,
) {
    return {
        operationId: `publication-${integrationPackage.envelope.kind}-${integrationPackage.envelope.version}`,
        kind: integrationPackage.envelope.kind,
        version: integrationPackage.envelope.version,
        digest: integrationPackage.digest,
        report: admission,
        snapshot: {} as never,
    };
}

function report(
    integrationPackage: ResolvedIntegrationPackage,
    overrides: Partial<IntegrationCompatibilityAdmissionReport> = {},
): IntegrationCompatibilityAdmissionReport {
    return {
        reportType: "admission",
        id: "report-1",
        kind: integrationPackage.envelope.kind,
        version: integrationPackage.envelope.version,
        packageDigest: integrationPackage.digest,
        evaluator: { name: "registry", version: "1" },
        createdAt: "2026-07-26T00:00:00.000Z",
        baselines: [],
        informationalBaselines: [],
        evidence: [],
        outcome: "not-applicable",
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        admissible: true,
        noBaselineReason: "new-kind",
        ...overrides,
    };
}
