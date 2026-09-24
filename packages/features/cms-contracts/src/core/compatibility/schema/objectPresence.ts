import type { UlviaObjectSchema } from "../../../interfaces/UlviaSchema";

/** In a closed object, requiring as many properties as declared makes every property mandatory. */
export function guaranteesObjectProperty(schema: UlviaObjectSchema, name: string): boolean {
    return (
        Object.hasOwn(schema.properties, name) &&
        (schema.required.includes(name) || (schema.minProperties ?? 0) >= Object.keys(schema.properties).length)
    );
}
