import { catalogueRevision } from "cms-repository/exports/contracts/protocol";
import { resolveContractLineage, type ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import type { ProviderManifest } from "cms-repository/providers/manifests/interfaces/ProviderManifest";
import type { StoredContractSelections } from "../../interfaces/ContractSelectionStore";
import { delegationAllows } from "cms-repository/providers/manifests/core/delegation/delegationAllows";

/** Preview candidate policies against current exact targets; absent targets never become requirements. */
export async function previewProviderAuthority(
    manifest: ProviderManifest,
    current: StoredContractSelections | null,
    releases: ReleaseCatalogue,
) {
    const load = async (contractId: string, version: string, digest: string) => {
        const record = await releases.get(contractId, version);
        if (!record || record.admission.digest !== digest) {
            throw new TypeError("Authority preview pin is unavailable");
        }
        const lineage = await resolveContractLineage(releases, record.admission.release);
        return lineage.flatMap((release, index) =>
            release.capabilities.map((capability) => ({
                release,
                digest: index === 0 ? digest : lineage[index - 1]!.extends!.digest,
                capability,
            })),
        );
    };
    const targets = (
        await Promise.all(
            (current?.plan.selections ?? []).map((selection) =>
                load(selection.contractId, selection.version, selection.digest),
            ),
        )
    ).flat();
    const policies = manifest.implementations.flatMap((implementation) =>
        implementation.delegation
            ? [{ implementationContractId: implementation.contractId, ...implementation.delegation }]
            : [],
    );
    const matches: Array<{
        sourceContractId: string;
        sourceVersion: string;
        sourceDigest: string;
        sourceCapabilityId: string;
        targetContractId: string;
        targetVersion: string;
        targetDigest: string;
        targetCapabilityId: string;
        effect: "query" | "command";
        sensitive: boolean;
        access: "public" | "authenticated" | "admin";
    }> = [];
    for (const implementation of manifest.implementations.filter((item) => item.delegation)) {
        for (const source of await load(implementation.contractId, implementation.version, implementation.digest)) {
            for (const target of targets) {
                if (
                    delegationAllows(
                        implementation.delegation,
                        source.capability,
                        target.release.contractId,
                        target.capability,
                    )
                ) {
                    if (matches.length >= 1024) {
                        throw new TypeError("Delegation preview exceeds 1024 capability pairs");
                    }
                    matches.push({
                        sourceContractId: source.release.contractId,
                        sourceVersion: source.release.version,
                        sourceDigest: source.digest,
                        sourceCapabilityId: source.capability.id,
                        targetContractId: target.release.contractId,
                        targetVersion: target.release.version,
                        targetDigest: target.digest,
                        targetCapabilityId: target.capability.id,
                        effect: target.capability.behavior.effect,
                        sensitive: target.capability.behavior.sensitive,
                        access: target.capability.access,
                    });
                }
            }
        }
    }
    const delegation = { policies, matches };
    return {
        delegation,
        authorityDigest: await catalogueRevision({
            manifest,
            selections: current?.plan.selections ?? [],
            grants: current?.grants ?? null,
            revision: current?.revision ?? 0,
            delegation,
        }),
    };
}
