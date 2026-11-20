import { prepareCompactMetadata } from "./metadata/compact";
import { budgetFor } from "../../../capabilities/policies";
import { sampleScenario } from "../../../harness/execution/samples";
import { ClientFailure } from "../../../harness/clients/failure";
import { assertCondition } from "../../queries/types";
import { metadataContexts } from "./state/context";
import { prepareMetadataDocumentation } from "./docs/recipe";
import { prepareMetadataList } from "./lists/recipe";
import { prepareMetadataInvalidation } from "./metadata/recipe";
import type { CapabilityInventory, Variant } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

export function metadataCatalogueScenarios(inventory: CapabilityInventory, fixture: string) {
    const contexts = metadataContexts(inventory);
    return [
        "documentation.search",
        "documentation.get",
        "list-available-providers",
        "list-provider-installations",
        "capabilities.describe",
        "gateway.route.get",
        "gateway.route.snapshot",
        "gateway.mcp.resolve",
        "gateway.mcp.authorized",
    ].flatMap((capability) => {
        const target = inventory.targets.find(
            (row) =>
                !row.retained &&
                row.release.contractId === "ulvia/cms.installations" &&
                row.definition.id === capability,
        );
        assertCondition(target, "metadata-catalogue-inventory-stale");
        const variants: readonly Variant[] = [
            "documentation.search",
            "list-available-providers",
            "list-provider-installations",
            "gateway.route.snapshot",
        ].includes(capability)
            ? ["large", "history", "invalidation"]
            : ["invalidation"];
        return target.definition.bindings.flatMap(({ id: binding }) =>
            variants.map((variant) => {
                const definition = {
                    id: `installation-metadata-catalogue.${capability}.${binding}.${variant}`,
                    version: 1,
                    fixture,
                    samples: 10,
                    obligations: [{ target: target.key, binding, variant }],
                    budget: budgetFor(target, variant),
                };
                return {
                    definition,
                    async execute(environment: QueryEnvironment) {
                        try {
                            const context = await contexts(environment, variant);
                            return await sampleScenario(
                                environment.stack,
                                definition,
                                definition.obligations[0]!,
                                (index) =>
                                    capability === "gateway.route.snapshot" ||
                                    capability === "gateway.mcp.resolve" ||
                                    capability === "gateway.mcp.authorized"
                                        ? prepareCompactMetadata(inventory, context, capability, variant)
                                        : capability.startsWith("documentation.")
                                          ? prepareMetadataDocumentation(
                                                inventory,
                                                context,
                                                capability,
                                                binding,
                                                variant,
                                                index,
                                            )
                                          : capability.startsWith("list-")
                                            ? prepareMetadataList(context, capability, variant)
                                            : prepareMetadataInvalidation(inventory, context, capability),
                            );
                        } catch (error) {
                            return {
                                scenario: definition.id,
                                status: "blocked" as const,
                                measurements: [],
                                failure: error instanceof ClientFailure ? error.code : "metadata-catalogue-preparation",
                            };
                        }
                    },
                };
            }),
        );
    });
}
