import {
    resolveContract,
    type ReleaseCatalogue,
    type ResolvedContract,
} from "@bernouy/cms-repository/contracts/catalogue";
import type { ContractSelection } from "@bernouy/cms-repository/providers/selections";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";

/** These exact admitted artifacts describe executable code, never current site authority. */
export async function prepareNativeContracts(report: ProviderRuntimeReport, releases: ReleaseCatalogue) {
    const contracts = new Map<string, ResolvedContract>();
    const capabilities = new Set<string>();
    for (const pin of report.implementations) {
        if (pin.status !== "ready" || pin.contractId === "ulvia.provider.connections") {
            continue;
        }
        const record = await releases.get(pin.contractId, pin.version);
        if (
            !record ||
            record.admission.digest !== pin.digest ||
            record.admission.release.contractId !== pin.contractId ||
            record.admission.release.version !== pin.version
        ) {
            throw new Error("Native contract does not match its admitted execution pin");
        }
        const resolved = await resolveContract(releases, record.admission);
        contracts.set(key(pin), resolved);
        for (const { release } of resolved.lineage) {
            for (const capability of release.capabilities) {
                capabilities.add(`${release.contractId}\0${release.version}\0${capability.id}`);
            }
        }
    }
    return {
        supports(claims: ProviderInvocationClaims): boolean {
            return capabilities.has(`${claims.contractId}\0${claims.contractVersion}\0${claims.capabilityId}`);
        },
        select(
            selections: readonly ContractSelection[],
            claims: ProviderInvocationClaims,
        ): ContractSelection | undefined {
            let found: ContractSelection | undefined;
            for (const selection of selections) {
                const concrete = contracts.get(key(selection));
                if (!supports(concrete, claims)) {
                    continue;
                }
                if (found) {
                    return undefined;
                }
                found = selection;
            }
            return found;
        },
    };
}
function key(pin: Pick<ContractSelection, "contractId" | "version" | "digest">): string {
    return `${pin.contractId}\0${pin.version}\0${pin.digest}`;
}

function supports(contract: ResolvedContract | undefined, claims: ProviderInvocationClaims): boolean {
    const requested = contract?.lineage.find(
        ({ release }) => release.contractId === claims.contractId && release.version === claims.contractVersion,
    );
    return Boolean(requested?.release.capabilities.some(({ id }) => id === claims.capabilityId));
}
