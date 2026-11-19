import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { CapabilityMcpBinding } from "@bernouy/cms-gateway/mcp";
import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import type { GatewayInvocation } from "@bernouy/cms-gateway";

export const context = { siteId: "site:a", actor: { kind: "anonymous" as const } };

export async function fixture(count = 70) {
    const original = await admitContractRelease({
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId: "example/catalog",
        name: "Catalogue",
        version: "1.0.0",
        publisherId: "example",
        capabilities: Array.from({ length: count }, (_, i) => ({
            id: `query.item${i}`,
            access: "public",
            behavior: { sensitive: false, effect: "query", execution: "sync" },
            input: { type: "object", properties: {}, required: [] },
            output: { type: "object", properties: {}, required: [] },
            errors: [],
            bindings: [{ id: "agent", transport: "mcp", tool: { name: `tool-${count - i}` } }],
        })),
    });
    let names = 0;
    let reads = 0;
    const tracked: AdmittedContractRelease = {
        ...original,
        release: {
            ...original.release,
            capabilities: original.release.capabilities.map((capability) => ({
                ...capability,
                bindings: capability.bindings.map((binding) =>
                    binding.transport !== "mcp"
                        ? binding
                        : {
                              ...binding,
                              tool: {
                                  ...binding.tool,
                                  get name() {
                                      names += 1;
                                      return binding.tool?.name;
                                  },
                              },
                          },
                ),
            })),
        },
    };
    let contracts = [tracked];
    const invoked: GatewayInvocation[] = [];
    const binding = new CapabilityMcpBinding({
        contracts: async () => {
            reads += 1;
            return contracts;
        },
        invoker: {
            invoke: async (invocation) => {
                invoked.push(invocation);
                return { kind: "success", requestId: "mcp-test-request", output: {} };
            },
        },
    });
    return {
        original,
        tracked,
        binding,
        invoked,
        names: () => names,
        reads: () => reads,
        replace: (next: AdmittedContractRelease[]) => {
            contracts = next;
        },
    };
}
