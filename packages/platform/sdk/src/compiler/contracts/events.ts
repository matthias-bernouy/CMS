import type { ContractEventDefinition } from "@bernouy/ulvia-contracts";
import type { EventDefinition } from "ulvia-sdk/interfaces/events";
import { compileSchema } from "ulvia-sdk/schema/compile";
export function compileEvents(events: readonly EventDefinition[]): readonly ContractEventDefinition[] {
    return events
        .map(({ schema, ...definition }) => ({ ...structuredClone(definition), schema: compileSchema(schema) }))
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}
