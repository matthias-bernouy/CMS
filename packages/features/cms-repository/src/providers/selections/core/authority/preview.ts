import { MAX_AUTHORITY_GRANTS } from "../limits";
import { catalogueRevision } from "cms-repository/exports/contracts/protocol";
import { resolveContractLineage, type ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import type { ProviderManifest } from "cms-repository/providers/manifests/interfaces/ProviderManifest";
import type { StoredContractSelections } from "../../interfaces/ContractSelectionStore";
import { authorityCapabilities, delegatedPairs } from "./capabilities";
import type { ContractSelection } from "../../interfaces/ContractSelection";

/** Preview candidate policies against current exact targets; absent targets never become requirements. */
export async function previewProviderAuthority(
    manifest: ProviderManifest,
    current: StoredContractSelections | null,
    releases: ReleaseCatalogue,
) {
    const load = async (selection: ContractSelection) => {
        const { contractId, version, digest } = selection;
        const record = await releases.get(contractId, version);
        if (!record || record.admission.digest !== digest) {
            throw new TypeError("Authority preview pin is unavailable");
        }
        return authorityCapabilities(selection, await resolveContractLineage(releases, record.admission.release));
    };
    const targets = (await Promise.all((current?.plan.selections ?? []).map(load))).flat();
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
        const sources = await load({
            siteId: current?.siteId ?? "preview",
            installationId: "preview",
            contractId: implementation.contractId,
            version: implementation.version,
            digest: implementation.digest,
        });
        for (const { source, target } of delegatedPairs(implementation.delegation, sources, targets, current?.grants)) {
            if (matches.length >= MAX_AUTHORITY_GRANTS) {
                throw new TypeError("Delegation preview exceeds the capability pair limit");
            }
            matches.push({
                sourceContractId: source.contractId,
                sourceVersion: source.version,
                sourceDigest: source.digest,
                sourceCapabilityId: source.capabilityId,
                targetContractId: target.contractId,
                targetVersion: target.version,
                targetDigest: target.digest,
                targetCapabilityId: target.capabilityId,
                effect: target.effect,
                sensitive: target.sensitive,
                access: target.access,
            });
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
