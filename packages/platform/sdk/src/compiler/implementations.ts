import { resolveContract } from "@bernouy/ulvia-contracts";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import type { CapabilitySource, ContractDefinition } from "ulvia-sdk/interfaces/contracts";
import type { CompiledImplementations, ContractImplementation } from "ulvia-sdk/interfaces/providers";
import type { RuntimeCapabilityPlan } from "ulvia-sdk/compiler/plan";
import { compileContracts } from "ulvia-sdk/compiler/contracts";
import { buildCatalogue } from "ulvia-sdk/compiler/catalogue";
import { storeProviderPlan } from "ulvia-sdk/compiler/plan";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

function effectiveSources(source: ContractDefinition): Map<string, CapabilitySource> {
    const capabilities = new Map<string, CapabilitySource>();
    const seen = new Set<ContractDefinition>();
    let current: ContractDefinition | undefined = source;
    while (current) {
        if (seen.has(current) || seen.size >= 24) {
            throw new SdkDefinitionError("Cyclic or oversized contract lineage", "$.extends");
        }
        seen.add(current);
        for (const [id, capability] of Object.entries(current.capabilities)) {
            if (capabilities.has(id)) {
                throw new SdkDefinitionError(`Cannot redeclare inherited capability ${id}`);
            }
            capabilities.set(id, capability);
        }
        current = current.extends;
    }
    return capabilities;
}

/** One static handler table drives both manifest claims and the runtime registration plan. */
export async function compileImplementations<Dependencies>(
    sources: readonly ContractImplementation<Dependencies>[],
    dependencies: readonly ContractDefinition[] = [],
): Promise<CompiledImplementations<Dependencies>> {
    const implementations = sources.map((source) => {
        const operations = new Map(
            [...effectiveSources(source.contract)].map(([id, capability]) => [id, capability.operation]),
        );
        const handlers = Object.freeze({ ...source.handlers });
        const expected = [...operations.keys()].sort();
        const actual = Object.keys(handlers).sort();
        if (
            expected.length !== actual.length ||
            expected.some((id, index) => actual[index] !== id) ||
            actual.some((id) => typeof handlers[id] !== "function")
        ) {
            throw new SdkDefinitionError(`Handler table does not match ${source.contract.contractId}`);
        }
        return {
            contract: source.contract,
            contractId: source.contract.contractId,
            version: source.contract.version,
            handlers,
            operations,
            requires: structuredClone(source.requires ?? []),
            ...(source.delegation ? { delegation: structuredClone(source.delegation) } : {}),
        };
    });
    const contracts = await compileContracts([...implementations.map((source) => source.contract), ...dependencies]);
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
                    operation: source.operations.get(capability.id)!,
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
