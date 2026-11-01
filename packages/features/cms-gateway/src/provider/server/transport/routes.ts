import type { HttpBindingDefinition } from "@bernouy/cms-repository/contracts/bindings";
import { capabilityBindings, pathTemplatesOverlap } from "@bernouy/cms-repository/contracts/bindings";
import type { CapabilityDefinition, ResolvedContract } from "@bernouy/cms-repository/contracts";

export type HttpBoundCapability = CapabilityDefinition & {
    readonly binding: HttpBindingDefinition;
};

export type ProviderRoute = {
    readonly dispatchContractId?: string;
    readonly contractId: string;
    readonly contractVersion: string;
    readonly capability: HttpBoundCapability;
    readonly match: (method: string, path: string) => Readonly<Record<string, string>> | null;
};

export function compileProviderRoutes(releases: readonly ResolvedContract[]): readonly ProviderRoute[] {
    const routes = releases.flatMap(({ release, capabilities }) =>
        capabilities.flatMap(({ definition: capability }) => {
            return capabilityBindings(capability).flatMap((binding) =>
                binding.transport === "http"
                    ? [compileRoute(release.contractId, release.version, { ...capability, binding })]
                    : [],
            );
        }),
    );
    const aliases = new Map<string, ProviderRoute>();
    for (const contract of releases) {
        for (const { release } of contract.lineage.slice(1)) {
            if (
                releases.some(
                    (view) =>
                        view.release.contractId === release.contractId && view.release.version === release.version,
                )
            ) {
                continue;
            }
            for (const capability of release.capabilities) {
                for (const binding of capabilityBindings(capability)) {
                    if (binding.transport !== "http") {
                        continue;
                    }
                    const key = `${release.contractId}@${release.version}/${capability.id}/${binding.id}`;
                    const previous = aliases.get(key);
                    if (previous && previous.dispatchContractId !== contract.release.contractId) {
                        throw new TypeError(
                            "Ambiguous inherited Provider route; mount the declaring contract explicitly",
                        );
                    }
                    aliases.set(key, {
                        ...compileRoute(release.contractId, release.version, { ...capability, binding }),
                        dispatchContractId: contract.release.contractId,
                    });
                }
            }
        }
    }
    routes.push(...aliases.values());
    assertRoutesDoNotOverlap(routes);
    return Object.freeze(routes);
}

function compileRoute(contractId: string, contractVersion: string, capability: HttpBoundCapability): ProviderRoute {
    const names: string[] = [];
    const escaped = capability.binding.path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const pattern = escaped.replace(/\\\{([A-Za-z][A-Za-z0-9_-]*)\\\}/gu, (_match, name: string) => {
        names.push(name);
        return "([^/]+)";
    });
    const expression = new RegExp(`^${pattern}$`, "u");
    return {
        contractId,
        contractVersion,
        capability,
        match(method, path) {
            const automaticHead =
                method === "HEAD" && capability.binding.method === "GET" && capability.output.type === "binary";
            if (method !== capability.binding.method && !automaticHead) {
                return null;
            }
            const match = expression.exec(path);
            return match ? Object.fromEntries(names.map((name, index) => [name, match[index + 1]!])) : null;
        },
    };
}

function assertRoutesDoNotOverlap(routes: readonly ProviderRoute[]): void {
    for (let leftIndex = 0; leftIndex < routes.length; leftIndex += 1) {
        const left = routes[leftIndex]!;
        for (let rightIndex = leftIndex + 1; rightIndex < routes.length; rightIndex += 1) {
            const right = routes[rightIndex]!;
            if (
                left.contractId === right.contractId &&
                left.contractVersion === right.contractVersion &&
                left.capability.binding.method === right.capability.binding.method &&
                pathTemplatesOverlap(left.capability.binding.path, right.capability.binding.path)
            ) {
                throw new TypeError(
                    `Provider routes overlap: ${left.contractId}/${left.capability.id} and ${right.contractId}/${right.capability.id}.`,
                );
            }
        }
    }
}
