import type { EventDefinition } from "ulvia-sdk/interfaces/events";

export function defineEvent<const Definition extends EventDefinition>(definition: Definition): Readonly<Definition> {
    return Object.freeze({ ...definition });
}
