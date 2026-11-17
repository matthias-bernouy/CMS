import type { CapabilityInventory, CapabilityTarget, Obligation, ScenarioDefinition } from "../../capabilities/types";

export type QueryContext = Readonly<{ subjectId: string; collectionId: string }>;
export type QueryCase = Readonly<{
    family: string;
    capability: string;
    site?: "registry";
    input?: (context: QueryContext) => Readonly<Record<string, unknown>>;
    assert: (output: Readonly<Record<string, unknown>>, context: QueryContext) => void;
}>;
export type QueryScenario = Readonly<{
    definition: ScenarioDefinition;
    target: CapabilityTarget;
    obligation: Obligation;
    recipe: QueryCase;
}>;

export function requireRecord(value: unknown): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Expected a business DTO");
    }
    return value as Readonly<Record<string, unknown>>;
}

export function assertCondition(value: unknown): asserts value {
    if (!value) {
        throw new Error("Business postcondition was not satisfied");
    }
}

export function findTarget(inventory: CapabilityInventory, recipe: QueryCase) {
    const target = inventory.targets.find(
        (entry) =>
            !entry.retained &&
            entry.release.contractId ===
                (recipe.family === "repository" ? "ulvia/repository" : `ulvia/cms.${recipe.family}`) &&
            entry.definition.id === recipe.capability,
    );
    if (!target || target.definition.behavior.effect !== "query" || target.definition.behavior.execution !== "sync") {
        throw new Error(`Query fixture is stale: ${recipe.family}/${recipe.capability}`);
    }
    return target;
}
