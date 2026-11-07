import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import type {
    ProviderCapabilityRegistry,
    ProviderCapabilityInvocationContext,
    ProviderOperationExecutor,
} from "@bernouy/ulvia-provider";
import type { UlviaProviderFeatureServices } from "@bernouy/ulvia-provider/capabilities";
import type { InstallationServices } from "@bernouy/repository/features/installations";
import { createInstallationOperationQueries } from "@bernouy/ulvia-provider";

const contractId = "ulvia/cms.installations";
function unavailable(port: string): never {
    throw new Error(`Unexpected fixture service call: ${port}`);
}
const absent = new Proxy(() => unavailable("unsupported method"), {
    get: (_target, key): unknown => (key === "then" ? undefined : absent),
});
type FixtureOptions = {
    readonly context?: Pick<ProviderCapabilityInvocationContext, "siteId" | "providerId">;
    readonly executor?: ProviderOperationExecutor;
};
export function installationFixturePorts(
    ports: Partial<InstallationServices> = {},
    options: FixtureOptions = {},
): UlviaProviderFeatureServices {
    const { siteId } = options.context ?? { siteId: "default" };
    const fallback = {
        initialization: absent,
        collections: absent,
        collectionUpgrades: absent,
        gateway: { siteId, contractUpgrades: absent },
        management: { administration: absent },
        documentation: absent,
        discovery: absent,
        operations: options.executor ? createInstallationOperationQueries(options.executor) : absent,
    };
    return {
        ...fallback,
        ...ports,
        gateway: { ...fallback.gateway, ...ports.gateway },
        management: { ...fallback.management, ...ports.management },
    } as unknown as UlviaProviderFeatureServices;
}
/** Full SDK mounting with explicit unit-only ports. Unsupported business calls/queueing fail loudly. */
export async function mountInstallations(
    dispatcher: ProviderCapabilityRegistry,
    ports: Partial<InstallationServices> = {},
    options: FixtureOptions = {},
) {
    const { siteId, providerId } = options.context ?? { siteId: "default", providerId: "ulvia/primary-provider" };
    const build = await loadOfficialFeatures();
    const contracts = build.implementedContracts.filter(({ release }) => release.contractId === contractId);
    const contract = contracts[0]!;
    const dependencies = installationFixturePorts(ports, { ...options, context: { siteId, providerId } });
    // Direct unit calls simulate the trusted receiver. Actual relay calls preserve its own binding/scope evidence.
    const registry: ProviderCapabilityRegistry = {
        invoke: dispatcher.invoke.bind(dispatcher),
        seal: dispatcher.seal.bind(dispatcher),
        register(id, capabilityId, handler) {
            const definition = contract.capabilities.find(
                ({ definition }) => definition.id === capabilityId,
            )!.definition;
            const binding = definition.bindings.find((binding) => binding.transport === "http")!;
            dispatcher.register(id, capabilityId, (input, context) =>
                handler(
                    input,
                    context.invocation
                        ? context
                        : {
                              ...context,
                              invocation: { contractId, instanceId: "instance-a", bindingId: binding.id },
                              http: {
                                  ...context.http,
                                  headers: new Headers(context.http?.headers),
                                  transportRequest: new Request(`https://provider.test${binding.path}`, {
                                      method: binding.method,
                                  }),
                              },
                          },
                ),
            );
        },
    };
    const workers: string[] = [];
    await registerOfficialFeatures(
        registry,
        dependencies,
        build.implementations.filter((claim) => claim.contractId === contractId),
        {
            providerId,
            scope: { siteId, instanceId: "instance-a" },
            operations: {
                register: (operation) => {
                    workers.push(operation.capabilityId);
                },
                enqueue: async () => unavailable("durable queue"),
            },
        },
    );
    if (workers.length !== 5) {
        throw new Error("The SDK must derive all five Installations workers");
    }
}
