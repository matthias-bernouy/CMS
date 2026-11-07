import { admitContractBundle, resolveContract } from "@bernouy/ulvia-contracts";
import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import { verifySpecialization } from "@bernouy/ulvia-contracts/catalogue";
import type { ContractReleaseReader } from "@bernouy/ulvia-contracts/catalogue";
import type { FeatureDefinition } from "ulvia-sdk/interfaces/features";
import { compileFixtures } from "ulvia-sdk/compiler/contracts/fixtures";
import { compileDocuments } from "ulvia-sdk/compiler/contracts/documents";
import { snapshotContracts } from "ulvia-sdk/compiler/contracts/sources";
import type { ContractSourceSnapshot } from "ulvia-sdk/compiler/contracts/sources";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

/** Compile ancestors before children, preserving exact immutable parent pins. No publication occurs. */
export async function compileContracts(
    sources: readonly FeatureDefinition[],
): Promise<readonly AdmittedContractRelease[]> {
    const snapshots = snapshotContracts(sources);
    const admitted = new Map<ContractSourceSnapshot, AdmittedContractRelease>();
    const coordinates = new Map<string, AdmittedContractRelease>();
    const reader: ContractReleaseReader = {
        get: async (id, version) => row(coordinates.get(`${id}@${version}`)),
        findByDigest: async (digest) => row([...coordinates.values()].find((value) => value.digest === digest)),
        list: async (id) =>
            [...coordinates.values()]
                .filter((value) => !id || value.release.contractId === id)
                .map((admission) => ({ admission, publishedAt: "1970-01-01T00:00:00Z" })),
    };
    for (const source of snapshots) {
        const parent = source.parent ? admitted.get(source.parent)! : undefined;
        const documents = await compileDocuments(source.documents);
        const fixtures = await compileFixtures(source.fixtures);
        const admission = await admitContractBundle(
            {
                ...source.release,
                ...(parent
                    ? {
                          extends: {
                              contractId: parent.release.contractId,
                              version: parent.release.version,
                              digest: parent.digest,
                          },
                      }
                    : {}),
                ...(fixtures.metadata.length ? { fixtureAssets: fixtures.metadata } : {}),
                ...(documents.metadata.length ? { documentation: documents.metadata } : {}),
            },
            [...documents.assets, ...fixtures.assets],
        );
        const key = `${admission.release.contractId}@${admission.release.version}`;
        const existing = coordinates.get(key);
        if (existing && existing.digest !== admission.digest) {
            throw new SdkDefinitionError(`Conflicting definitions for ${key}`);
        }
        verifySpecialization(
            admission.release,
            [...coordinates.values()].map((value) => row(value)!),
        );
        coordinates.set(key, admission);
        admitted.set(source, admission);
        await resolveContract(reader, admission);
    }
    return Object.freeze([...coordinates.values()]);
}

export async function compileContract(source: FeatureDefinition): Promise<AdmittedContractRelease> {
    const { contractId, version } = source;
    const releases = await compileContracts([source]);
    return releases.find(
        (release) => release.release.contractId === contractId && release.release.version === version,
    )!;
}

function row(admission: AdmittedContractRelease | undefined) {
    return admission ? { admission, publishedAt: "1970-01-01T00:00:00Z" } : null;
}
