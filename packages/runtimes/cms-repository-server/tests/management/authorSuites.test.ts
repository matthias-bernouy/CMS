import { describe, expect, test } from "bun:test";
import type { IntegrationRegistryCandidateRecord } from "@bernouy/cms-integration-registry";
import {
    buildIntegrationVerificationSuiteContent,
    identifyIntegrationVerificationSuiteContent,
    type AdmissionInputSnapshotV1,
    type IntegrationVerificationEnvelopeV1,
} from "@bernouy/cms-integration-verification";
import { createRepositoryCandidateAuthorSuiteResolver } from "../../src/core/candidates/authorSuites";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);

describe("production author suite resolution", () => {
    test("combines exact persisted inherited contracts with candidate conformance", async () => {
        const values = await fixtures();
        const resolver = createRepositoryCandidateAuthorSuiteResolver({
            async listActive() {
                return [values.inherited];
            },
        });

        const result = await resolver.resolve(values.input);

        expect(result.map((entry) => [entry.suiteId, entry.contentDigest])).toEqual([
            ["implementation", values.conformance.digest],
            ["public-contract", values.contract.digest],
        ]);
        expect(result[1]?.content).toEqual(values.contract.content);
    });

    test("fails closed when persisted lineage is missing or its closure is substituted", async () => {
        const values = await fixtures();
        const absent = createRepositoryCandidateAuthorSuiteResolver({
            async listActive() {
                return [];
            },
        });
        await expect(absent.resolve(values.input)).rejects.toThrow(/lineage changed/);

        const substituted = createRepositoryCandidateAuthorSuiteResolver({
            async listActive() {
                return [
                    {
                        ...values.inherited,
                        content: {
                            ...values.inherited.content,
                            sources: values.inherited.content.sources.map((entry, index) =>
                                index === 0
                                    ? {
                                          ...entry,
                                          file: { encoding: "utf8" as const, content: "export default false;" },
                                      }
                                    : entry,
                            ),
                        },
                    },
                ];
            },
        });
        await expect(substituted.resolve(values.input)).rejects.toThrow(/canonical content digest/);
    });
});

async function fixtures() {
    const owner = verification("1.0.0", {
        contracts: [{ contractId: "public-contract", entrypoint: "tests/contract.ts", activeMajorRange: "^1.0.0" }],
        conformance: [],
        files: { "tests/contract.ts": { encoding: "utf8", content: "export default true;" } },
    });
    const candidateVerification = verification("1.2.0", {
        contracts: [],
        conformance: [{ suiteId: "implementation", entrypoint: "tests/implementation.ts" }],
        files: { "tests/implementation.ts": { encoding: "utf8", content: "export default true;" } },
    });
    const contract = await identifyIntegrationVerificationSuiteContent(
        await buildIntegrationVerificationSuiteContent(owner, "contract", "public-contract"),
    );
    const conformance = await identifyIntegrationVerificationSuiteContent(
        await buildIntegrationVerificationSuiteContent(candidateVerification, "conformance", "implementation"),
    );
    const reference = {
        contractId: "public-contract",
        lineageId: "lineage-public-contract",
        ownerVersion: "1.0.0",
        contractDigest: contract.digest,
    };
    const admission: AdmissionInputSnapshotV1 = {
        schema: "cms.integration.admission-input.v1",
        candidate: {
            candidateId: "candidate-1",
            candidateDigest: DIGEST_A,
            kind: "example",
            version: "1.2.0",
            packageDigest: DIGEST_B,
            verificationDigest: DIGEST_C,
        },
        policyDigest: DIGEST_A,
        selectedRunner: { name: "cms-postgres", version: "1.0.0", imageDigest: `sha256:${DIGEST_A}` },
        reviewedBaselines: [],
        dependencies: [],
        activeContracts: [reference],
        suites: [
            { suiteId: "implementation", source: "author-conformance", contentDigest: conformance.digest },
            { suiteId: "public-contract", source: "author-contract", contentDigest: contract.digest },
        ],
        catalogRevision: { revisionId: "catalog-1", digest: DIGEST_A },
        compatibilityRevision: {
            revisionId: "compatibility-1",
            digest: DIGEST_B,
            evaluatorInputDigest: DIGEST_C,
        },
    };
    return {
        contract,
        conformance,
        input: { candidate: candidateRecord(), verification: candidateVerification, admission },
        inherited: {
            reference,
            suite: { suiteId: "public-contract", source: "author-contract" as const, contentDigest: contract.digest },
            ownerPackageDigest: DIGEST_A,
            ownerVerificationDigest: DIGEST_B,
            content: contract.content,
        },
    };
}

function verification(
    version: string,
    input: Pick<IntegrationVerificationEnvelopeV1["manifest"], "contracts" | "conformance"> &
        Readonly<{ files: IntegrationVerificationEnvelopeV1["files"] }>,
): IntegrationVerificationEnvelopeV1 {
    return {
        schema: "cms.integration.verification.v1",
        target: { kind: "example", version, packageDigest: DIGEST_B },
        manifest: {
            runnerRequirements: [{ name: "cms-postgres", versionRange: "^1.0.0" }],
            contracts: input.contracts,
            conformance: input.conformance,
            fixtures: [],
        },
        files: input.files,
    };
}

function candidateRecord(): IntegrationRegistryCandidateRecord {
    return {
        schema: "cms.integration.registry.candidate-record.v3",
        candidateId: "candidate-1",
        revision: 3,
        status: "queued",
        kind: "example",
        version: "1.2.0",
        candidateDigest: DIGEST_A,
        packageDigest: DIGEST_B,
        verificationDigest: DIGEST_C,
        createdAt: "2026-07-27T10:00:00.000Z",
        updatedAt: "2026-07-27T10:00:00.000Z",
        expiresAt: "2026-07-28T10:00:00.000Z",
        attemptCount: 0,
    };
}
