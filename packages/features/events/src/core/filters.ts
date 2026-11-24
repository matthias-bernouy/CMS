import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { EventDefinition } from "cms-events/interfaces/definition";
import { eventJson, eventHash } from "./identity";
import { EventsError } from "./errors";
export const filterKey = (json?: string) => eventHash(eventJson(json ?? "{}", 16384));
export function validateEventFilter(definition: EventDefinition, json?: string): void {
    const filter = eventJson(json ?? "{}", 16384);
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
        throw new EventsError("INVALID_INPUT");
    }
    if (!Object.keys(filter).length) {
        return;
    }
    if (definition.schema.type !== "object") {
        throw new EventsError("INVALID_INPUT");
    }
    for (const [name, value] of Object.entries(filter)) {
        if (!definition.filterKeys?.includes(name)) {
            throw new EventsError("INVALID_INPUT");
        }
        try {
            validateSchemaValue(definition.schema.properties[name]!, value);
        } catch {
            throw new EventsError("INVALID_INPUT");
        }
    }
}
export function eventRoutingKeys(definition: EventDefinition, value: unknown): readonly string[] {
    const keys = definition.filterKeys ?? [];
    if (keys.length > 8) {
        throw new EventsError("INVALID_INPUT");
    }
    const input = value as Record<string, unknown>;
    return Array.from({ length: 2 ** keys.length }, (_, mask) =>
        eventHash(Object.fromEntries(keys.flatMap((key, index) => (mask & (1 << index) ? [[key, input[key]]] : [])))),
    );
}
