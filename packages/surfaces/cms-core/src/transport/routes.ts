import { pathTemplatesOverlap } from "@bernouy/cms-repository/contracts/bindings";
import type { CapabilityDefinition, ContractRelease } from "@bernouy/cms-repository/contracts";

export type CoreRoute = {
    readonly contractId: string;
    readonly capability: CapabilityDefinition;
    readonly match: (method: string, path: string) => Readonly<Record<string, string>> | null;
};

export function compileCoreRoutes(releases: readonly ContractRelease[]): readonly CoreRoute[] {
    if (releases.length === 0 || releases.some((release) => !release.contractId.startsWith("ulvia.cms."))) {
        throw new TypeError("CMS Core only accepts ulvia.cms.* contract releases.");
    }
    const routes = releases.flatMap((release) =>
        release.capabilities.map((capability) => compileRoute(release.contractId, capability)),
    );
    assertRoutesDoNotOverlap(routes);
    return Object.freeze(routes);
}

function compileRoute(contractId: string, capability: CapabilityDefinition): CoreRoute {
    const names: string[] = [];
    const escaped = capability.binding.path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const pattern = escaped.replace(/\\\{([A-Za-z][A-Za-z0-9_-]*)\\\}/gu, (_match, name: string) => {
        names.push(name);
        return "([^/]+)";
    });
    const expression = new RegExp(`^${pattern}$`, "u");
    return {
        contractId,
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

function assertRoutesDoNotOverlap(routes: readonly CoreRoute[]): void {
    for (let leftIndex = 0; leftIndex < routes.length; leftIndex += 1) {
        const left = routes[leftIndex]!;
        for (let rightIndex = leftIndex + 1; rightIndex < routes.length; rightIndex += 1) {
            const right = routes[rightIndex]!;
            if (
                left.contractId === right.contractId &&
                left.capability.binding.method === right.capability.binding.method &&
                pathTemplatesOverlap(left.capability.binding.path, right.capability.binding.path)
            ) {
                throw new TypeError(
                    `CMS Core routes overlap: ${left.contractId}/${left.capability.id} and ${right.contractId}/${right.capability.id}.`,
                );
            }
        }
    }
}
