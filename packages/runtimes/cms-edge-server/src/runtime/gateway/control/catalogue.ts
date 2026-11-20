import type { CapabilityGateway } from "@bernouy/cms-gateway";
import { collectMcpContracts } from "@bernouy/cms-gateway/mcp";
import type { McpInvocationContext } from "@bernouy/cms-gateway/mcp";
import type { ControlProviderClient } from "../ControlProviderClient";

/** Preserve the ordinary Gateway authorization of the selected-contract list for every MCP request. */
export class ControlMcpCatalogue {
    constructor(
        private readonly gateway: Pick<CapabilityGateway, "invoke" | "resolveContract">,
        private readonly control: ControlProviderClient,
    ) {}
    private async ids(context: McpInvocationContext) {
        const result = await this.gateway.invoke({
            ...context,
            contractId: "ulvia/cms.installations",
            capabilityId: "list-provider-installations",
            input: {},
        });
        if (result.kind !== "success") {
            throw new Error("Selected contract catalogue is unavailable");
        }
        const selections = (result.output as { selections: { contractId: string }[] }).selections;
        return [...new Set(selections.map(({ contractId }) => contractId))];
    }
    async list(context: McpInvocationContext) {
        const ids = await this.ids(context);
        return collectMcpContracts(ids, (contractId) =>
            this.gateway.resolveContract({ siteId: context.siteId, contractId }),
        );
    }
    async resolve(name: string, context: McpInvocationContext) {
        return this.control.resolveToolContract(await this.ids(context), name);
    }
}
