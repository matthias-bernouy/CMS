import type { UlviaSchema } from "ulvia-contracts/interfaces/UlviaSchema";

/** Events carry JSON values, never streams or binary leaves. */
export function isJsonEventSchema(schema: UlviaSchema): boolean {
    switch (schema.type) {
        case "binary":
            return false;
        case "object":
            return Object.values(schema.properties).every(isJsonEventSchema);
        case "array":
            return isJsonEventSchema(schema.items);
        case "map":
            return isJsonEventSchema(schema.values);
        default:
            return true;
    }
}
