import { resolveContract } from "@bernouy/ulvia-contracts";
import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import type { CompiledImplementations } from "ulvia-sdk/interfaces/providers";
import type { RuntimeCapabilityPlan } from "ulvia-sdk/compiler/plan";
import type { CapturedImplementation } from "ulvia-sdk/compiler/implementations/capture";
import { buildCatalogue } from "ulvia-sdk/compiler/catalogue";
import { storeProviderPlan } from "ulvia-sdk/compiler/plan";
import { assertSourceLineage } from "ulvia-sdk/compiler/implementations/lineage";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

export async function linkImplementations<Dependencies>(
    implementations: readonly CapturedImplementation<Dependencies>[],
    contracts: readonly AdmittedContractRelease[],
): Promise<CompiledImplementations<Dependencies>> {
    const catalogue = buildCatalogue(contracts);
    const implementedContracts = [];
    const claims = [];
    const plan: RuntimeCapabilityPlan<Dependencies>[] = [];
    const aliasOwners = new Map<string, string>();
    for (const source of implementations) {
        const release = await catalogue.get(source.contractId, source.version);
        if (!release) {
            throw new SdkDefinitionError("Compiled implementation is missing");
        }
        const view = await resolveContract(catalogue, release.admission);
        assertSourceLineage(source.lineage, view);
        implementedContracts.push(view);
        claims.push({
            contractId: source.contractId,
            version: source.version,
            digest: view.digest,
            requires: source.requires,
            ...(source.delegation ? { delegation: source.delegation } : {}),
        });
        for (const { definition: capability, owner } of view.capabilities) {
            const requests = [{ contractId: source.contractId, version: source.version }];
            for (let ancestorIndex = 1; ancestorIndex < view.lineage.length; ancestorIndex++) {
                const ancestor = view.lineage[ancestorIndex]!;
                if (
                    view.lineage
                        .slice(ancestorIndex)
                        .some((entry) => entry.release.contractId === owner.contractId && entry.digest === owner.digest)
                ) {
                    const alias = `${ancestor.release.contractId}@${ancestor.release.version}/${capability.id}`;
                    const owner = `${source.contractId}@${source.version}`;
                    if (aliasOwners.has(alias) && aliasOwners.get(alias) !== owner) {
                        throw new SdkDefinitionError(`Ambiguous inherited handler for ${alias}`);
                    }
                    aliasOwners.set(alias, owner);
                    requests.push({ contractId: ancestor.release.contractId, version: ancestor.release.version });
                }
            }
            plan.push(
                Object.freeze({
                    contractId: source.contractId,
                    version: source.version,
                    requests: Object.freeze(requests),
                    capability,
                    source: source.capabilities.get(capability.id)!,
                    createHandler: source.handlers[capability.id]!,
                }),
            );
        }
    }
    compileProviderRoutes(implementedContracts);
    const build = Object.freeze({
        implementations: Object.freeze(claims),
        contracts,
        implementedContracts: Object.freeze(implementedContracts),
    }) as CompiledImplementations<Dependencies>;
    storeProviderPlan(build, plan);
    return build;
}
