import { budgetFor } from "../../../capabilities/policies";
import { assertCondition } from "../../queries/types";
import { authoringReadContexts } from "./context";
import { executeAuthoringRead } from "./execute";
import type { CapabilityInventory, Variant } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";
import type { AuthoredKind } from "../../../fixtures/authored";

export function authoringReadScenarios(inventory: CapabilityInventory, fixture: string) {
    const contexts = authoringReadContexts(inventory);
    const implementation = inventory.targets.find(
        (row) => !row.retained && row.release.contractId === "ulvia/cms.content",
    )!.release;
    return [
        "get-collection-sources",
        "get-contract-sources",
        "get-provider-manifest-sources",
        "get-source-snapshot",
        "get-publication-operation",
    ].flatMap((capability) => {
        const target = inventory.targets.find(
            (row) =>
                !row.retained && row.release.contractId === "ulvia/cms.authoring" && row.definition.id === capability,
        );
        assertCondition(target, "source-reader-inventory-stale");
        const kinds: readonly AuthoredKind[] =
            capability === "get-source-snapshot"
                ? ["collection", "contract", "provider-manifest"]
                : [
                      capability.includes("provider-manifest")
                          ? "provider-manifest"
                          : capability.includes("contract")
                            ? "contract"
                            : "collection",
                  ];
        const variants: readonly Variant[] =
            capability === "get-publication-operation" ? ["invalidation"] : ["large", "history", "invalidation"];
        return target.definition.bindings.flatMap(({ id: binding }) =>
            variants.map((variant) => {
                const definition = {
                    id: `authoring-source-read.${capability}.${binding}.${variant}`,
                    version: 2,
                    fixture,
                    samples: 10,
                    obligations: [{ target: target.key, binding, variant }],
                    budget: budgetFor(target, variant),
                };
                return {
                    definition,
                    execute: (environment: QueryEnvironment) =>
                        executeAuthoringRead(
                            inventory,
                            environment,
                            definition,
                            contexts(environment),
                            implementation,
                            capability,
                            binding,
                            variant,
                            kinds,
                        ),
                };
            }),
        );
    });
}
