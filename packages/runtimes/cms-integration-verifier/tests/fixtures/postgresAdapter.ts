import {
    computeIntegrationVerificationDigest,
    identifyReleaseAdmissionPolicySnapshot,
    identifyPlatformVerificationSuiteDefinition,
    POSTGRES_PLATFORM_VERIFICATION_SUITES_V1,
    PLATFORM_VERIFICATION_EVIDENCE_SCHEMA,
    type PlatformVerificationEvidenceV1,
} from "@bernouy/cms-integration-verification";
import { computeIntegrationPackageDigest, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type { PostgresPlatformVerificationAdapter, VerificationSandboxInput } from "../../src";
import { DIGEST_A } from "./contracts";
import { sandboxInputFixture } from "./workload";

export function createPostgresPlatformVerificationAdapter(): PostgresPlatformVerificationAdapter {
    return {
        async environmentVersions() {
            return [{ name: "postgres", version: "16.4" }];
        },
        async verifyPackage({ platformSuites }, signal) {
            signal.throwIfAborted();
            return {
                durationMs: 10,
                suites: platformSuites.map((suite) => evidence(suite)),
            };
        },
        async verifyAuthorSuites({ suites }, signal) {
            signal.throwIfAborted();
            return suites.map((suite) => ({
                suiteId: suite.suiteId,
                suiteDigest: suite.contentDigest,
                outcome: "passed" as const,
                durationMs: 1,
                evidenceDigest: suite.contentDigest,
            }));
        },
    };
}

export async function postgresPlatformInputFixture(
    packageEnvelope?: IntegrationPackageEnvelopeV1,
): Promise<VerificationSandboxInput> {
    const base = await sandboxInputFixture();
    const packageValue = packageEnvelope ?? base.workload.package;
    const packageDigest = await computeIntegrationPackageDigest(packageValue);
    const verification = {
        ...base.workload.verification,
        target: { ...base.workload.verification.target, packageDigest },
    };
    const verificationDigest = await computeIntegrationVerificationDigest(verification);
    const platformRequiredSuites = (
        await Promise.all(
            POSTGRES_PLATFORM_VERIFICATION_SUITES_V1.map(async (definition) => ({
                suiteId: definition.suiteId,
                suiteDigest: (await identifyPlatformVerificationSuiteDefinition(definition)).digest,
                runner: base.workload.admission.selectedRunner,
                applicability: definition.applicability,
            })),
        )
    ).toSorted((left, right) => left.suiteId.localeCompare(right.suiteId));
    const policy = {
        ...base.workload.policy,
        identity: { ...base.workload.policy.identity, version: "1.2.0" },
        verificationPolicy: { ...base.workload.policy.verificationPolicy, version: "1.2.0" },
        platformRequiredSuites,
    };
    const policyDigest = (await identifyReleaseAdmissionPolicySnapshot(policy)).digest;
    const hasSql = packageValue.files[packageValue.definition]?.content.includes('"schemas"') ?? false;
    const hasDataApi = packageValue.files[packageValue.definition]?.content.includes('"dataApiSchemas"') ?? false;
    return {
        ...base,
        workload: {
            ...base.workload,
            package: packageValue,
            verification,
            policy,
            admission: {
                ...base.workload.admission,
                candidate: {
                    ...base.workload.admission.candidate,
                    packageDigest,
                    verificationDigest,
                },
                policyDigest,
                suites: [
                    ...base.workload.admission.suites.filter((suite) => suite.source !== "platform"),
                    ...platformRequiredSuites.map((suite) => ({
                        suiteId: suite.suiteId,
                        source: "platform" as const,
                        contentDigest: suite.suiteDigest,
                        applicable:
                            suite.applicability === "always" ||
                            (suite.applicability === "sql-connectors" && hasSql) ||
                            (suite.applicability === "data-api-schemas" && hasDataApi),
                    })),
                ].toSorted((left, right) => left.suiteId.localeCompare(right.suiteId)),
            },
        },
    };
}

function evidence(suite: {
    suiteId: string;
    suiteDigest: string;
    applicable: boolean;
}): PlatformVerificationEvidenceV1 {
    const definition = POSTGRES_PLATFORM_VERIFICATION_SUITES_V1.find((entry) => entry.suiteId === suite.suiteId)!;
    return {
        schema: PLATFORM_VERIFICATION_EVIDENCE_SCHEMA,
        suiteId: suite.suiteId,
        suiteDigest: suite.suiteDigest,
        applicability: definition.applicability,
        outcome: suite.applicable ? "passed" : "not-applicable",
        checks: definition.checks.map((checkId) => ({
            checkId,
            outcome: suite.applicable ? "passed" : "not-applicable",
            subjectCount: suite.applicable ? 1 : 0,
            observationDigest: DIGEST_A,
            findings: [],
            findingsTruncated: false,
        })),
    };
}
