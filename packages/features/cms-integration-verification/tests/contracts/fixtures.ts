import { computeIntegrationPackageDigest, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type {
    CompatibilityFinding,
    IntegrationVerificationEnvelopeV1,
    MigrationReport,
    ReleaseAdmissionDecision,
    VerificationReport,
} from "../../src/exports/index";

export const DIGEST_A = "a".repeat(64);
export const DIGEST_B = "b".repeat(64);
export const DIGEST_C = "c".repeat(64);
export const IMAGE_A = `sha256:${DIGEST_A}`;
export const CREATED_AT = "2026-07-26T12:00:00.000Z";

export function packageEnvelope(): IntegrationPackageEnvelopeV1 {
    return {
        schema: "cms.integration.package.v1",
        kind: "example",
        version: "1.2.0",
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: "{}" },
            "release-notes.md": { encoding: "utf8", content: "Release" },
        },
    };
}

export async function verificationEnvelope(): Promise<IntegrationVerificationEnvelopeV1> {
    const packageDigest = await computeIntegrationPackageDigest(packageEnvelope());
    return {
        schema: "cms.integration.verification.v1",
        target: { kind: "example", version: "1.2.0", packageDigest },
        manifest: {
            runnerRequirements: [{ name: "cms-postgres", versionRange: "^1.2.0" }],
            contracts: [{ contractId: "public-contract", entrypoint: "tests/contract.ts", activeMajorRange: "^1.0.0" }],
            conformance: [{ suiteId: "implementation", entrypoint: "tests/conformance.ts" }],
            fixtures: ["fixtures/data.bin"],
        },
        files: {
            "tests/contract.ts": { encoding: "utf8", content: "export default true;" },
            "tests/conformance.ts": { encoding: "utf8", content: "export default true;" },
            "fixtures/data.bin": { encoding: "base64", content: "AAE=" },
        },
    };
}

export function provenance() {
    return { actor: "repository-ci", reason: "candidate-admission", evidenceIds: ["evidence-1"] } as const;
}

export function runner() {
    return { name: "cms-postgres", version: "1.2.3", imageDigest: IMAGE_A } as const;
}

export function verificationReport(finding?: CompatibilityFinding): VerificationReport {
    void finding;
    return {
        schema: "cms.integration.verification-report.v1",
        reportId: "verification-1",
        revisionType: "root",
        origin: "admission",
        createdAt: CREATED_AT,
        kind: "example",
        version: "1.2.0",
        packageDigest: DIGEST_A,
        verificationDigest: DIGEST_B,
        runner: runner(),
        policy: { name: "default-admission", version: "1.2.0" },
        dependencies: [],
        baselines: [{ kind: "example", version: "1.1.0", packageDigest: DIGEST_C }],
        activeContracts: [{ contractId: "public-contract", ownerVersion: "1.1.0", digest: DIGEST_C }],
        environment: { digest: DIGEST_B, versions: { postgres: "16.4", bun: "1.3.14" } },
        results: [
            {
                suiteId: "public-contract",
                source: "author-contract",
                required: true,
                outcome: "passed",
                durationMs: 12,
                attempts: 2,
                cacheHit: false,
            },
        ],
        outcome: "passed",
        provenance: provenance(),
    };
}

export function migrationReport(): MigrationReport {
    const passed = { outcome: "passed" as const, evidenceDigest: DIGEST_C };
    return {
        schema: "cms.integration.migration-report.v1",
        reportId: "migration-1",
        revisionType: "root",
        origin: "admission",
        createdAt: CREATED_AT,
        source: { kind: "example", version: "1.1.0", packageDigest: DIGEST_B },
        target: { kind: "example", version: "1.2.0", packageDigest: DIGEST_A },
        connectorKey: "primary",
        lineageId: "example-supabase-v1",
        migrationRevision: 2,
        supportedSourceRange: "^1.0.0",
        runner: runner(),
        policy: { name: "migration", version: "1.0.0" },
        environmentDigest: DIGEST_B,
        checks: {
            freshInstall: passed,
            migratedState: passed,
            equivalence: passed,
            failureInjection: { outcome: "not-supported" },
            resumption: { outcome: "not-supported" },
        },
        cutover: { cmsMediated: "binding-revision", providerDirect: "expand-in-code" },
        rollback: "available",
        pointOfNoReturn: "cleanup",
        delayedCleanupVerified: true,
        outcome: "passed",
        provenance: provenance(),
    };
}

export function admissionDecision(): ReleaseAdmissionDecision {
    return {
        schema: "cms.integration.release-admission-decision.v1",
        decisionId: "decision-1",
        revisionType: "root",
        kind: "example",
        version: "1.2.0",
        packageDigest: DIGEST_A,
        compatibilityReportRevisionId: "compatibility-1",
        verificationReportRevisionId: "verification-1",
        migrationReportRevisionIds: ["migration-1"],
        policy: { name: "default-admission", version: "1.2.0" },
        admissible: true,
        reasons: [],
        createdAt: CREATED_AT,
        provenance: provenance(),
    };
}
