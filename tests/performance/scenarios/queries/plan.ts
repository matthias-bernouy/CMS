import { budgetFor, loadPolicy } from "../../capabilities/policies";
import type { CapabilityInventory } from "../../capabilities/types";
import { administrationQueries } from "./administration";
import { contentQueries } from "./content";
import { installationQueries } from "./installations";
import { repositoryQueries } from "./repository";
import { findTarget } from "./types";
import type { QueryScenario } from "./types";

export function queryScenarios(inventory: CapabilityInventory, fixture: string): QueryScenario[] {
    return [...administrationQueries, ...contentQueries, ...installationQueries, ...repositoryQueries].flatMap(
        (recipe) => {
            const target = findTarget(inventory, recipe);
            return target.definition.bindings.flatMap((binding) =>
                (["nominal", "warm", "concurrent"] as const).map((variant) => {
                    const obligation = { target: target.key, binding: binding.id, variant };
                    const definition = {
                        id: `${recipe.family}.${recipe.capability}.${binding.id}.${variant}`,
                        version: 1,
                        fixture,
                        obligations: [obligation],
                        budget: budgetFor(target, variant),
                        samples: 10,
                        ...loadPolicy(variant),
                    };
                    return { definition, target, obligation, recipe };
                }),
            );
        },
    );
}
