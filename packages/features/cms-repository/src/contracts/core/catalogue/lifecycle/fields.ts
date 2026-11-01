import type { UlviaSchema } from "../../../interfaces/UlviaSchema";

/** Stable field identities survive even when an output field was optional. */
export function firstRemovedField(previous: UlviaSchema, next: UlviaSchema, path: string): string | undefined {
    if (previous.type === "object") {
        for (const [name, property] of Object.entries(previous.properties)) {
            const replacement = next.type === "object" ? next.properties[name] : undefined;
            const location = `${path}.properties[${JSON.stringify(name)}]`;
            if (!replacement) {
                return location;
            }
            const removed = firstRemovedField(property, replacement, location);
            if (removed) {
                return removed;
            }
        }
    } else if (previous.type === "array" && next.type === "array") {
        return firstRemovedField(previous.items, next.items, `${path}.items`);
    } else if (previous.type === "map" && next.type === "map") {
        return firstRemovedField(previous.values, next.values, `${path}.values`);
    }
    return undefined;
}
