import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    runnerSatisfiesRequirement,
    type AdmissionActiveContractReferenceV1,
    type AdmissionSuitePlanEntryV1,
    type IntegrationVerificationEnvelopeV1,
    type PinnedVerificationRunnerIdentity,
    type PlatformRequiredVerificationSuiteV1,
    type ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import {
    FsIntegrationRegistryCandidateAdmissionPlanningError,
    type IntegrationVerificationContractCatalog,
} from "./types";

export type CandidateSuiteSelection = Readonly<{
    runner: PinnedVerificationRunnerIdentity;
    activeContracts: readonly AdmissionActiveContractReferenceV1[];
    suites: readonly AdmissionSuitePlanEntryV1[];
}>;

export async function selectCandidateSuites(input: {
    kind: string;
    version: string;
    verification: IntegrationVerificationEnvelopeV1;
    policy: ReleaseAdmissionPolicySnapshotV1;
    definition?: IntegrationDefinition;
    inherited?: IntegrationVerificationContractCatalog;
}): Promise<CandidateSuiteSelection> {
    const runner = selectRunner(input.verification, input.policy);
    const inherited = (await input.inherited?.listActive(input.kind, input.version)) ?? [];
    const activeContracts = inherited.map((entry) => entry.reference);
    const suites: AdmissionSuitePlanEntryV1[] = [
        ...input.policy.platformRequiredSuites
            .filter((suite) => sameRunner(suite.runner, runner))
            .map((suite) => ({
                suiteId: suite.suiteId,
                source: "platform" as const,
                contentDigest: suite.suiteDigest,
                ...(suite.applicability === undefined
                    ? {}
                    : { applicable: platformSuiteApplies(suite.applicability, input.definition) }),
            })),
        ...inherited.map((entry) => entry.suite),
    ];
    for (const contract of input.verification.manifest.contracts) {
        const digest = await authorSuiteDigest(input.verification, "contract", contract);
        activeContracts.push({
            contractId: contract.contractId,
            lineageId: await contractLineageId(input.kind, contract.contractId),
            ownerVersion: input.version,
            contractDigest: digest,
        });
        suites.push({ suiteId: contract.contractId, source: "author-contract", contentDigest: digest });
    }
    for (const conformance of input.verification.manifest.conformance) {
        suites.push({
            suiteId: conformance.suiteId,
            source: "author-conformance",
            contentDigest: await authorSuiteDigest(input.verification, "conformance", conformance),
        });
    }
    assertUnique(
        activeContracts.map((entry) => entry.contractId),
        "active contract",
    );
    assertUnique(
        suites.map((entry) => entry.suiteId),
        "suite",
    );
    return Object.freeze({
        runner,
        activeContracts: Object.freeze(
            activeContracts.toSorted((left, right) => compareText(left.contractId, right.contractId)),
        ),
        suites: Object.freeze(suites.toSorted((left, right) => compareText(left.suiteId, right.suiteId))),
    });
}

function platformSuiteApplies(
    applicability: NonNullable<PlatformRequiredVerificationSuiteV1["applicability"]>,
    definition: IntegrationDefinition | undefined,
): boolean {
    if (applicability === "always") {
        return true;
    }
    if (!definition) {
        throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
            "runner_unavailable",
            "Platform suite applicability requires the exact parsed candidate definition",
        );
    }
    const sqlConnectors = (definition.connectors ?? []).filter(
        (connector) => connector.provider === "supabase" && (connector.schemas?.length ?? 0) > 0,
    );
    if (applicability === "sql-connectors") {
        return sqlConnectors.length > 0;
    }
    return sqlConnectors.some((connector) => (connector.dataApiSchemas?.length ?? 0) > 0);
}

function selectRunner(
    verification: IntegrationVerificationEnvelopeV1,
    policy: ReleaseAdmissionPolicySnapshotV1,
): PinnedVerificationRunnerIdentity {
    const runner = policy.approvedRunners.find((candidate) =>
        verification.manifest.runnerRequirements.every((requirement) =>
            runnerSatisfiesRequirement(candidate, requirement),
        ),
    );
    if (!runner) {
        throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
            "runner_unavailable",
            "No exact policy-approved runner satisfies every verification requirement",
        );
    }
    return runner;
}

async function authorSuiteDigest(
    verification: IntegrationVerificationEnvelopeV1,
    type: "contract" | "conformance",
    suite: Readonly<{ entrypoint: string }>,
): Promise<string> {
    return await sha256Hex(
        canonicalJsonBytes({
            schema: "cms.integration.verification-suite-content.v1",
            type,
            suite,
            entrypoint: verification.files[suite.entrypoint],
            fixtures: verification.manifest.fixtures.map((path) => ({ path, file: verification.files[path] })),
        }),
    );
}

async function contractLineageId(kind: string, contractId: string): Promise<string> {
    const digest = await sha256Hex(canonicalJsonBytes({ kind, contractId }));
    return `contract-${digest.slice(0, 32)}`;
}

function assertUnique(values: readonly string[], label: string): void {
    if (new Set(values).size !== values.length) {
        throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
            "suite_conflict",
            `Candidate ${label} identifiers conflict with inherited or policy-owned suites`,
        );
    }
}

function sameRunner(left: PinnedVerificationRunnerIdentity, right: PinnedVerificationRunnerIdentity): boolean {
    return left.name === right.name && left.version === right.version && left.imageDigest === right.imageDigest;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
