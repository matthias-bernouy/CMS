import type { ContractDefinition } from "ulvia-sdk/interfaces/contracts";

export function defineContract<const Definition extends ContractDefinition>(
    definition: Definition,
): Readonly<Definition> {
    return Object.freeze({
        ...definition,
        operations: Object.freeze([...definition.operations]),
    }) as Readonly<Definition>;
}
