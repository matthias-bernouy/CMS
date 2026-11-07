import { InMemoryContentRepository } from "@bernouy/cms-content";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import type { ProviderCapabilityRegistry } from "@bernouy/ulvia-provider";
import type { CmsContentDependencies } from "../../../src/ports/index";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { createContentContributions } from "../../../src/capabilities/features/services/content";
const unused = async (): Promise<never> => {
    throw new Error("Unexpected Content test service call");
};
export function contentPorts(dependencies: Partial<CmsContentDependencies> = {}) {
    const ports = {
        repo: new InMemoryContentRepository(),
        collections: { snapshot: unused, saveTexts: unused },
        publicDelivery: () => ({ resolvePath: unused }),
        ...dependencies,
    } as CmsContentDependencies;
    return { ...ports, publicDelivery: ports.publicDelivery!, contributions: createContentContributions(ports) };
}
/** Unit tests supply trusted contexts directly; real HTTP tests keep their receiver-created Request and claims. */
export async function mountContentForTest(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: Partial<CmsContentDependencies>,
    options = { siteId: "default", providerId: "ulvia/primary-provider" },
) {
    const build = await loadOfficialFeatures();
    const releases = build.implementations.filter(({ contractId }) => contractId === "ulvia/cms.content");
    const contracts = build.implementedContracts.filter(({ release }) => release.contractId === "ulvia/cms.content");
    const routes = compileProviderRoutes(contracts);
    const registry: ProviderCapabilityRegistry = {
        invoke: dispatcher.invoke.bind(dispatcher),
        seal: dispatcher.seal.bind(dispatcher),
        register: (contractId, id, handler) =>
            dispatcher.register(contractId, id, (input, context) => {
                const binding = routes.find(({ capability }) => capability.id === id)!.capability.binding;
                const path = binding.path.replace(/\{([^}]+)\}/gu, (_match, key: string) =>
                    encodeURIComponent(String(input[key])),
                );
                const headers = new Headers(context.http?.headers ?? context.requestContext?.headers);
                return handler(input, {
                    ...context,
                    invocation: context.invocation ?? { contractId, instanceId: "instance-a" },
                    http: {
                        ...context.http,
                        headers,
                        transportRequest:
                            context.http?.transportRequest ??
                            new Request("https://provider.test" + path, { method: binding.method, headers }),
                    },
                });
            }),
    };
    await registerOfficialFeatures(registry, contentPorts(dependencies), releases, {
        providerId: options.providerId,
        scope: { siteId: options.siteId, instanceId: "instance-a" },
    });
}
