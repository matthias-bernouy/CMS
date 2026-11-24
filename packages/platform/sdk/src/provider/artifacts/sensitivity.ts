import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
export function sameRetainedSensitivity(previous: UlviaSchema, current: UlviaSchema): boolean {
    if (previous.type === "string" && current.type === "string") {
        return Boolean(previous.sensitive) === Boolean(current.sensitive);
    }
    if (previous.type === "object" && current.type === "object") {
        return Object.entries(previous.properties).every(
            ([name, child]) => !current.properties[name] || sameRetainedSensitivity(child, current.properties[name]!),
        );
    }
    if (previous.type === "array" && current.type === "array") {
        return sameRetainedSensitivity(previous.items, current.items);
    }
    if (previous.type === "map" && current.type === "map") {
        return sameRetainedSensitivity(previous.values, current.values);
    }
    return true;
}
