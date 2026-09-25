import { ReleaseValidationError } from "../protocol/errors";
import type { UlviaSchema } from "../../interfaces/UlviaSchema";

export function assertJsonCompatible(schema: UlviaSchema, path: string): void {
    switch (schema.type) {
        case "array":
            assertJsonCompatible(schema.items, `${path}.items`);
            return;
        case "binary":
            throw new ReleaseValidationError(
                "invalid_binding",
                "binary values require an explicit transport encoding",
                path,
            );
        case "map":
            assertJsonCompatible(schema.values, `${path}.values`);
            return;
        case "object":
            for (const [name, property] of Object.entries(schema.properties)) {
                assertJsonCompatible(property, `${path}.${name}`);
            }
            return;
        default:
            return;
    }
}
