import type { FsIntegrationVerificationContractCatalog } from "@bernouy/cms-integration-registry/fs";
import {
    buildIntegrationVerificationSuiteContent,
    identifyIntegrationVerificationSuiteContent,
    validateBoundIntegrationVerificationAuthorSuites,
    type BoundIntegrationVerificationAuthorSuiteV1,
} from "@bernouy/cms-integration-verification";
import type { RepositoryCandidateAuthorSuiteResolver } from "@bernouy/cms-repository-management";

type AdmissionSuite = Parameters<RepositoryCandidateAuthorSuiteResolver["resolve"]>[0]["admission"]["suites"][number];
type AuthorAdmissionSuite = AdmissionSuite & Readonly<{ source: "author-contract" | "author-conformance" }>;

export function createRepositoryCandidateAuthorSuiteResolver(
    contracts: Pick<FsIntegrationVerificationContractCatalog, "listActive">,
): RepositoryCandidateAuthorSuiteResolver {
    const resolver: RepositoryCandidateAuthorSuiteResolver = {
        async resolve(input) {
            const inherited = await contracts.listActive(input.candidate.kind, input.candidate.version);
            const expectedInherited = input.admission.activeContracts.filter(
                (contract) => contract.ownerVersion !== input.candidate.version,
            );
            if (
                inherited.length !== expectedInherited.length ||
                expectedInherited.some((reference) =>
                    inherited.every(
                        (entry) =>
                            entry.reference.contractId !== reference.contractId ||
                            entry.reference.lineageId !== reference.lineageId ||
                            entry.reference.ownerVersion !== reference.ownerVersion ||
                            entry.reference.contractDigest !== reference.contractDigest,
                    ),
                )
            ) {
                throw new Error("Persisted verification contract lineage changed after candidate planning");
            }
            const authorSuites = await Promise.all(
                input.admission.suites
                    .filter(isAuthorSuite)
                    .map(async (suite): Promise<BoundIntegrationVerificationAuthorSuiteV1> => {
                        if (suite.source === "author-conformance") {
                            return await ownSuite(input.verification, suite, "conformance");
                        }
                        const reference = input.admission.activeContracts.find(
                            (contract) => contract.contractId === suite.suiteId,
                        );
                        if (!reference) {
                            throw new Error(`Admission contract ${suite.suiteId} has no exact lineage reference`);
                        }
                        if (reference.ownerVersion === input.candidate.version) {
                            return await ownSuite(input.verification, suite, "contract");
                        }
                        const persisted = inherited.find(
                            (entry) =>
                                entry.reference.contractId === reference.contractId &&
                                entry.reference.lineageId === reference.lineageId &&
                                entry.reference.ownerVersion === reference.ownerVersion &&
                                entry.reference.contractDigest === reference.contractDigest,
                        );
                        if (!persisted) {
                            throw new Error(
                                `Inherited contract ${suite.suiteId} is absent from exact persisted lineage`,
                            );
                        }
                        return Object.freeze({ ...suite, content: persisted.content });
                    }),
            );
            return await validateBoundIntegrationVerificationAuthorSuites(authorSuites, input.admission);
        },
    };
    return Object.freeze(resolver);
}

async function ownSuite(
    verification: Parameters<RepositoryCandidateAuthorSuiteResolver["resolve"]>[0]["verification"],
    suite: AuthorAdmissionSuite,
    type: "contract" | "conformance",
): Promise<BoundIntegrationVerificationAuthorSuiteV1> {
    const content = await buildIntegrationVerificationSuiteContent(verification, type, suite.suiteId);
    const identified = await identifyIntegrationVerificationSuiteContent(content);
    if (identified.digest !== suite.contentDigest) {
        throw new Error(`Candidate suite ${suite.suiteId} changed after admission planning`);
    }
    return Object.freeze({ ...suite, content: identified.content });
}

function isAuthorSuite(suite: AdmissionSuite): suite is AuthorAdmissionSuite {
    return suite.source === "author-contract" || suite.source === "author-conformance";
}
