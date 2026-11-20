import { capabilityBindings } from "@bernouy/ulvia-contracts/bindings";
import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import { capabilityToolName } from "./tools";

/** Validate the complete identity space before applying host exposure policy. */
export function mcpCatalogueEntries(
    contracts: readonly AdmittedContractRelease[],
    binaryInputs: boolean,
    binaryOutputs: boolean,
) {
    const entries = contracts.flatMap((contract) =>
        contract.release.capabilities.flatMap((capability) =>
            capabilityBindings(capability).flatMap((binding) =>
                binding.transport === "mcp"
                    ? [
                          {
                              contractId: contract.release.contractId,
                              capability,
                              binding,
                              digest: contract.digest,
                              documentation: contract.release.documentation ?? [],
                          },
                      ]
                    : [],
            ),
        ),
    );
    if (entries.length > 1_024) {
        throw new Error("MCP catalogue exceeds limits or contains duplicate tool identities");
    }
    const named = entries.map((entry) => ({
        ...entry,
        toolName: capabilityToolName(entry.contractId, entry.capability.id, entry.binding.id, entry.binding.tool?.name),
    }));
    if (new Set(named.map(({ toolName }) => toolName)).size !== entries.length) {
        throw new Error("MCP catalogue exceeds limits or contains duplicate tool identities");
    }
    return named
        .filter(
            ({ capability }) =>
                !capability.responseEffects?.length &&
                (binaryInputs ||
                    !Object.values(capability.input.properties).some((schema) => schema.type === "binary")) &&
                (binaryOutputs || capability.output.type !== "binary"),
        )
        .sort((a, b) => (a.toolName < b.toolName ? -1 : a.toolName > b.toolName ? 1 : 0));
}
