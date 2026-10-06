import { pathTemplatesOverlap } from "@bernouy/cms-repository/contracts/bindings";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import type { CapabilityDefinition, ContractRelease } from "@bernouy/cms-repository/contracts";
import { OfficialCoreCapabilityError, type OfficialCoreCapabilities } from "../core/coreCapabilities";
import { decodeCoreContractInput } from "./coreContractInput";

type CoreRoute = {
    readonly contractId: string;
    readonly capability: CapabilityDefinition;
    readonly match: (method: string, path: string) => Readonly<Record<string, string>> | null;
};

/** Relays any declared Core contract HTTP binding without contract-specific routing code. */
export function createCoreContractRelay(
    releases: readonly ContractRelease[],
    core: OfficialCoreCapabilities,
): (request: Request) => Promise<Response | null> {
    const routes = releases.flatMap((release) =>
        release.capabilities.map((capability) => compileRoute(release.contractId, capability)),
    );
    assertRoutesDoNotOverlap(routes);
    return async (request) => {
        const url = new URL(request.url);
        const selected = routes
            .map((route) => ({ route, parameters: route.match(request.method, url.pathname) }))
            .find(({ parameters }) => parameters !== null);
        if (!selected?.parameters) {
            return null;
        }
        const { contractId, capability } = selected.route;
        let input: Readonly<Record<string, unknown>>;
        try {
            input = await decodeCoreContractInput(request, url, capability, selected.parameters);
            validateSchemaValue(capability.input, input);
        } catch {
            return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
        }
        try {
            const output = await core.invoke(contractId, capability.id, input);
            validateSchemaValue(capability.output, output);
            return successResponse(request.method, capability, output);
        } catch (cause) {
            if (cause instanceof OfficialCoreCapabilityError) {
                const status = capability.binding.response.errorStatuses[cause.code];
                if (status === cause.status) {
                    return Response.json(
                        { error: { code: cause.code } },
                        { status, headers: { "Cache-Control": "no-store" } },
                    );
                }
                return Response.json({ error: { code: "CORE_UNAVAILABLE" } }, { status: 503 });
            }
            return Response.json({ error: { code: "CORE_UNAVAILABLE" } }, { status: 503 });
        }
    };
}

function compileRoute(contractId: string, capability: CapabilityDefinition): CoreRoute {
    if (
        (typeof capability.binding.input?.body === "object" && "binaryProperty" in capability.binding.input.body) ||
        capability.binding.response.contentTypes.some((contentType) => contentType !== "application/json")
    ) {
        throw new TypeError("Core contract relays currently support JSON contracts only.");
    }
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
            if (method !== capability.binding.method) {
                return null;
            }
            const match = expression.exec(path);
            if (!match) {
                return null;
            }
            return Object.fromEntries(names.map((name, index) => [name, match[index + 1]!]));
        },
    };
}

function assertRoutesDoNotOverlap(routes: readonly CoreRoute[]): void {
    for (let leftIndex = 0; leftIndex < routes.length; leftIndex += 1) {
        const left = routes[leftIndex]!;
        for (let rightIndex = leftIndex + 1; rightIndex < routes.length; rightIndex += 1) {
            const right = routes[rightIndex]!;
            if (
                left.capability.binding.method === right.capability.binding.method &&
                pathTemplatesOverlap(left.capability.binding.path, right.capability.binding.path)
            ) {
                throw new TypeError(
                    `Core contract routes overlap: ${left.contractId}/${left.capability.id} and ${right.contractId}/${right.capability.id}.`,
                );
            }
        }
    }
}

function successResponse(method: string, capability: CapabilityDefinition, output: unknown): Response {
    const status = capability.binding.response.successStatuses[0]!;
    const headers = { "Cache-Control": "no-store" };
    if (method === "HEAD" || status === 204 || status === 205) {
        return new Response(null, { status, headers });
    }
    return Response.json(output, { status, headers });
}
